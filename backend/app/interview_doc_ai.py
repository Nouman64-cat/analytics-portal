"""Read interview documents (PDF / DOCX) and pull out interview details with AI.

An interview document is usually a recruiter's invite: who the interviewers are, the meeting
link, when the interview is, and the job description. `analyze_interview_document` turns its
text into those fields plus the technical keywords the JD names (used both for PDF highlighting
and for highlighting the JD text in the UI). DOCX is read straight from its XML — no conversion.
"""

from __future__ import annotations

import io
import json
import logging
import re
import zipfile
from datetime import date, datetime, time
from typing import Optional
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

# Characters of document text sent to the model — enough for a long JD plus invite details.
_MAX_TEXT_CHARS = 15000
_INTERVIEWER_MAX_LEN = 255  # Interview.interviewer column
_LINK_MAX_LEN = 1000  # Interview.interview_link column

_W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_R_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_HYPERLINK_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"

DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
DEFAULT_DURATION_MINUTES = 30

_TZ_EASTERN = ZoneInfo("America/New_York")
_TZ_PKT = ZoneInfo("Asia/Karachi")


def is_docx_upload(content_type: Optional[str], filename: Optional[str]) -> bool:
    """Some browsers send an empty/generic content type for Word files, so check the name too."""
    return content_type == DOCX_CONTENT_TYPE or (filename or "").lower().endswith(".docx")


def est_to_pkt(on: date, est: time) -> time:
    """US Eastern wall-clock time (EST or EDT, whichever applies on that date) → PKT."""
    return datetime.combine(on, est, tzinfo=_TZ_EASTERN).astimezone(_TZ_PKT).time()


class DocumentReadError(Exception):
    pass


def _with_links(text: str, links: list[str]) -> str:
    """Meeting links are often hidden behind anchor text ("Click here to join the meeting"),
    so the URLs behind hyperlinks are appended for the model to see."""
    unique = [u for i, u in enumerate(links) if u.startswith(("http://", "https://")) and u not in links[:i]]
    if not unique:
        return text
    return text + "\n\nHyperlinks in the document:\n" + "\n".join(unique)


def text_from_pdf_document(doc) -> str:
    """Text + hyperlink URLs from an already-open pymupdf document."""
    text = "\n".join(page.get_text() for page in doc).strip()
    links = [lnk["uri"] for page in doc for lnk in page.get_links() if lnk.get("uri")]
    return _with_links(text, links)


def text_from_pdf(data: bytes) -> str:
    import pymupdf

    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as e:
        raise DocumentReadError(f"Could not read PDF: {e}") from e
    try:
        return text_from_pdf_document(doc)
    finally:
        doc.close()


def text_from_docx(data: bytes) -> str:
    """Text + hyperlink URLs from a .docx, read straight from its XML (no LibreOffice needed).
    Table cells are paragraphs too, so iterating every <w:p> in order covers tables."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            body = ElementTree.fromstring(zf.read("word/document.xml"))
            try:
                rels = ElementTree.fromstring(zf.read("word/_rels/document.xml.rels"))
            except KeyError:
                rels = None
    except (zipfile.BadZipFile, KeyError, ElementTree.ParseError) as e:
        raise DocumentReadError(f"Could not read Word document: {e}") from e

    lines = []
    for para in body.iter(f"{_W_NS}p"):
        parts = []
        for node in para.iter():
            if node.tag == f"{_W_NS}t" and node.text:
                parts.append(node.text)
            elif node.tag == f"{_W_NS}tab":
                parts.append("\t")
            elif node.tag in (f"{_W_NS}br", f"{_W_NS}cr"):
                parts.append("\n")
        lines.append("".join(parts))
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()

    links: list[str] = []
    if rels is not None:
        hyperlink_ids = {
            h.get(f"{_R_NS}id") for h in body.iter(f"{_W_NS}hyperlink") if h.get(f"{_R_NS}id")
        }
        for rel in rels:
            if rel.get("Type") == _HYPERLINK_REL and rel.get("Id") in hyperlink_ids:
                links.append(rel.get("Target") or "")
    # Links typed as plain text are already in `text`; field-code links (HYPERLINK "...") aren't.
    for instr in body.iter(f"{_W_NS}instrText"):
        m = re.search(r'HYPERLINK\s+"([^"]+)"', instr.text or "")
        if m:
            links.append(m.group(1))
    return _with_links(text, links)


def text_from_upload(data: bytes, is_docx: bool) -> str:
    return text_from_docx(data) if is_docx else text_from_pdf(data)


_SYSTEM_PROMPT = """You read interview invitation / job description documents for a recruiting team and extract structured details.

Return ONLY a JSON object with exactly these keys:
- "interviewers": array of the full names of the people who will conduct the interview (the interviewers / panel). Do NOT include the candidate, the recruiter who sent the invite, or the hiring company's name. Empty array if none are named.
- "meeting_link": the URL to join the interview meeting (Zoom, Microsoft Teams, Google Meet, Webex, etc.), copied exactly. Prefer a real join URL from the "Hyperlinks in the document" list over anchor text. null if there is none.
- "interview_date": the date of the interview as an object {"year": <4-digit year, or null if the document doesn't write the year>, "month": <1-12>, "day": <1-31>}. Read dates like "Mon 5 Oct" or "10/5" carefully (US documents write month/day). null if no interview date is given.
- "start_time": the interview start time as 24-hour "HH:MM", exactly as written in the document (times are US Eastern; do not convert time zones). null if no time is given.
- "duration_minutes": the interview length in minutes as an integer, taken from a stated duration (e.g. "45 minutes", "1 hour") or from a start–end time range. null if neither is given.
- "job_description": the job description section of the document, copied VERBATIM (same wording, same order, keep line breaks and bullet points). Leave out meeting logistics (interviewer names, links, dial-in numbers, scheduling notes). null if the document has no job description.
- "keywords": every distinct framework, programming language, tool, technology, platform, methodology, and technical concept named in the job description (e.g. React, Python, Docker, AWS, microservices, REST API, CI/CD, Agile, machine learning). Copy each EXACTLY as it appears in the text (same casing and spelling) so it can be found verbatim. No soft skills (e.g. "communication"), no company/role/person names. Deduplicate.

Never invent anything that is not in the document."""


def resolve_date(value, today: date) -> Optional[date]:
    """{"year", "month", "day"} → date. Documents usually omit the year ("Mon 5 Oct"), so a
    missing year picks whichever of last/this/next year's date is closest to today — right for
    upcoming interviews, for documents uploaded after the fact, and across New Year."""
    if not isinstance(value, dict):
        return None
    try:
        month, day = int(value["month"]), int(value["day"])
        if value.get("year"):
            return date(int(value["year"]), month, day)
    except (KeyError, TypeError, ValueError):
        return None
    candidates = []
    for year in (today.year - 1, today.year, today.year + 1):
        try:
            candidates.append(date(year, month, day))
        except ValueError:  # e.g. Feb 29 outside a leap year
            pass
    return min(candidates, key=lambda d: abs((d - today).days), default=None)


def analyze_interview_document(text: str, api_key: str) -> dict:
    """Ask the model for the interview's details. Returns interviewer, interview_link,
    interview_date (date), time_est (time), duration_minutes (int or None when the document
    doesn't say), job_description and keywords. Every value is sanitized here, so callers can
    store what comes back without re-checking it."""
    today = datetime.now(_TZ_EASTERN).date()
    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": f"Today's date: {today.isoformat()}\n\n{text[:_MAX_TEXT_CHARS]}"},
        ],
        temperature=0.1,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    try:
        raw = json.loads(response.choices[0].message.content or "{}")
    except json.JSONDecodeError:
        logger.warning("Interview document analysis returned invalid JSON")
        raw = {}
    if not isinstance(raw, dict):
        raw = {}

    names = raw.get("interviewers")
    names = [str(n).strip() for n in names if str(n).strip()] if isinstance(names, list) else []
    interviewer = ", ".join(dict.fromkeys(names))[:_INTERVIEWER_MAX_LEN].strip(" ,") or None

    link = raw.get("meeting_link")
    link = link.strip() if isinstance(link, str) else ""
    meeting_link = link if re.match(r"^https?://\S+$", link) and len(link) <= _LINK_MAX_LEN else None

    interview_date = resolve_date(raw.get("interview_date"), today)

    try:
        time_est = datetime.strptime(str(raw.get("start_time") or "").strip(), "%H:%M").time()
    except ValueError:
        time_est = None

    duration = raw.get("duration_minutes")
    duration_minutes = duration if isinstance(duration, int) and 5 <= duration <= 480 else None

    jd = raw.get("job_description")
    job_description = jd.strip() if isinstance(jd, str) and jd.strip() else None

    kws = raw.get("keywords")
    keywords: list[str] = []
    seen: set[str] = set()
    for k in kws if isinstance(kws, list) else []:
        k = str(k).strip()
        if k and k.lower() not in seen:
            seen.add(k.lower())
            keywords.append(k)

    return {
        "interviewer": interviewer,
        "interview_link": meeting_link,
        "interview_date": interview_date,
        "time_est": time_est,
        "duration_minutes": duration_minutes,
        "job_description": job_description,
        "keywords": keywords,
    }


def ai_failure_reason(e: Exception) -> str:
    """A user-facing reason for an OpenAI failure — specific enough to act on, no secrets."""
    import openai

    if isinstance(e, openai.AuthenticationError):
        return "AI document reading failed: the OpenAI API key is invalid."
    if isinstance(e, openai.RateLimitError):
        if "insufficient_quota" in str(e) or "credit" in str(e).lower():
            return "AI document reading failed: the OpenAI account has no credits left."
        return "AI document reading failed: OpenAI rate limit reached, try again in a minute."
    if isinstance(e, (openai.APIConnectionError, openai.APITimeoutError)):
        return "AI document reading failed: could not reach OpenAI."
    return "Could not analyze the document right now."

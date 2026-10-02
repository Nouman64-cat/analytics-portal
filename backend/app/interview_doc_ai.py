"""Read interview documents (PDF / Word) and pull out interview details with AI.

An interview document is usually a recruiter's invite: who the interviewers are, the meeting
link, and the job description. `analyze_interview_document` turns its text into those fields
plus the technical keywords the JD names (used both for PDF highlighting and for highlighting
the JD text in the UI).
"""

from __future__ import annotations

import io
import json
import logging
import re
import zipfile
from typing import Optional
from xml.etree import ElementTree

logger = logging.getLogger(__name__)

# Characters of document text sent to the model — enough for a long JD plus invite details.
_MAX_TEXT_CHARS = 15000
_INTERVIEWER_MAX_LEN = 255  # Interview.interviewer column
_LINK_MAX_LEN = 1000  # Interview.interview_link column

_W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_R_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_HYPERLINK_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"


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


def text_from_upload(data: bytes, word_ext: Optional[str], soffice_path: str) -> str:
    """Text of an uploaded interview document. Old binary .doc has no XML to read, so it's
    converted to PDF first (same LibreOffice path the upload itself uses)."""
    if word_ext == ".docx":
        return text_from_docx(data)
    if word_ext == ".doc":
        from app.doc_conversion import DocumentConversionError, convert_word_to_pdf

        try:
            data = convert_word_to_pdf(data, ".doc", soffice_path)
        except DocumentConversionError as e:
            raise DocumentReadError(str(e)) from e
    return text_from_pdf(data)


_SYSTEM_PROMPT = """You read interview invitation / job description documents for a recruiting team and extract structured details.

Return ONLY a JSON object with exactly these keys:
- "interviewers": array of the full names of the people who will conduct the interview (the interviewers / panel). Do NOT include the candidate, the recruiter who sent the invite, or the hiring company's name. Empty array if none are named.
- "meeting_link": the URL to join the interview meeting (Zoom, Microsoft Teams, Google Meet, Webex, etc.), copied exactly. Prefer a real join URL from the "Hyperlinks in the document" list over anchor text. null if there is none.
- "job_description": the job description section of the document, copied VERBATIM (same wording, same order, keep line breaks and bullet points). Leave out meeting logistics (interviewer names, links, dial-in numbers, scheduling notes). null if the document has no job description.
- "keywords": every distinct framework, programming language, tool, technology, platform, methodology, and technical concept named in the job description (e.g. React, Python, Docker, AWS, microservices, REST API, CI/CD, Agile, machine learning). Copy each EXACTLY as it appears in the text (same casing and spelling) so it can be found verbatim. No soft skills (e.g. "communication"), no company/role/person names. Deduplicate.

Never invent anything that is not in the document."""


def analyze_interview_document(text: str, api_key: str) -> dict:
    """Ask the model for {interviewers, meeting_link, job_description, keywords}. Every value is
    sanitized here, so callers can store what comes back without re-checking it."""
    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": text[:_MAX_TEXT_CHARS]},
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
        "job_description": job_description,
        "keywords": keywords,
    }

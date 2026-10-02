"""Parse a pasted "Interview Scheduled!" lead message into lead-form values with AI.

BDs share new leads as short chat messages (Agency/End Client, Role/Title, Round, Dev, Profile
Name, Interviewer, Date and Time). `parse_lead_message` maps each part onto the options the user
can actually pick in the lead form — tolerating spelling mistakes — and normalizes anything new
(e.g. a role that doesn't exist yet) so it can be created with clean spelling/casing.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from app.interview_doc_ai import resolve_date, _TZ_EASTERN

logger = logging.getLogger(__name__)

_MAX_MESSAGE_CHARS = 4000
# Same choices as the interview form's Round picker.
ROUND_OPTIONS = ["Recruiter's Call", "Phone Screen", "1st", "2nd", "3rd", "4th", "5th", "6th", "Final"]

_SYSTEM_PROMPT = """You turn a recruiting team's "interview scheduled" chat message into lead-form values.

The message usually has lines like:
  Agency/End Client: <company>      Role/Title: <job title>      Round: <round>
  Dev: <candidate>                  Profile Name: <resume profile>
  Interviewer: <names>              Date and Time: <date> at <time> EST
Labels can vary, be misspelled, or be missing.

You are given the existing COMPANIES, RESUME_PROFILES, CANDIDATES and JOB_ROLES, each as "id: name".
Names in the message may have typos, missing/extra spaces, different casing, or be abbreviated —
pick the existing entry that clearly refers to the same thing. Only pick an entry when you are
confident it is the same company/person/role; never pick something merely similar in a different way.

Return ONLY a JSON object with exactly these keys:
- "company_id": id of the existing company whose name matches the WHOLE Agency/End Client text (e.g. "Walmart(TEKsystems)" matches an existing "Walmart (TEKsystems)" or "Walmart (TekSystems)"; it does NOT match just "Walmart" or just "TEKsystems"). null if none matches.
- "company_name": the Agency/End Client text, cleaned up: fix obvious typos, use a space before an opening bracket ("Walmart(TEKsystems)" -> "Walmart (TEKsystems)"), keep the company's usual capitalization. null if the message has no company.
- "resume_profile_id": id of the existing resume profile matching "Profile Name". null if none matches.
- "candidate_id": id of the existing candidate matching "Dev". null if none matches.
- "job_role_name": if an existing job role means the same title (ignoring typos, spacing, casing), its name copied EXACTLY from JOB_ROLES; otherwise the title from the message with typos fixed and professional title casing (acronyms in capitals: "Ai engineer" -> "AI Engineer", "ml ops engineer" -> "MLOps Engineer"; tidy brackets/spacing: "Software Engineer ( AI/Agentic AI)" -> "Software Engineer (AI/Agentic AI)"). null if no title.
- "round": one of ROUNDS that matches the message's round (e.g. "first" -> "1st", "final round" -> "Final", "recruiter call" -> "Recruiter's Call"). null if no round.
- "interviewer": interviewer name(s) as written (typos fixed), several joined with ", ". null if none.
- "interview_date": {"year": <4-digit year or null if not written>, "month": <1-12>, "day": <1-31>}, or null if no date.
- "start_time": interview start time as 24-hour "HH:MM", as written (times are US Eastern; do not convert). null if none."""


def parse_time(value: Optional[str]):
    """ "14:30", "2:30 PM", "2:30pm", "2 PM" → time; None if it isn't a clock time."""
    if not value:
        return None
    v = value.strip().upper().replace(".", "")
    for fmt in ("%H:%M", "%I:%M %p", "%I:%M%p", "%I %p", "%I%p"):
        try:
            return datetime.strptime(v, fmt).time()
        except ValueError:
            pass
    return None


def _options_block(title: str, options: list[dict]) -> str:
    lines = "\n".join(f"{o['id']}: {o['name']}" for o in options) or "(none)"
    return f"{title}:\n{lines}"


def parse_lead_message(
    message: str,
    companies: list[dict],
    resume_profiles: list[dict],
    candidates: list[dict],
    job_roles: list[dict],
    api_key: str,
) -> dict:
    """Each option list is [{"id", "name"}] — exactly what the user can pick in the form. Returned
    ids are guaranteed to come from those lists; everything else is sanitized."""
    from openai import OpenAI

    today = datetime.now(_TZ_EASTERN).date()
    context = "\n\n".join([
        _options_block("COMPANIES", companies),
        _options_block("RESUME_PROFILES", resume_profiles),
        _options_block("CANDIDATES", candidates),
        _options_block("JOB_ROLES", job_roles),
        "ROUNDS: " + ", ".join(ROUND_OPTIONS),
        f"Today's date: {today.isoformat()}",
        "MESSAGE:\n" + message[:_MAX_MESSAGE_CHARS],
    ])
    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": context},
        ],
        temperature=0,
        max_tokens=600,
        response_format={"type": "json_object"},
    )
    try:
        raw = json.loads(response.choices[0].message.content or "{}")
    except json.JSONDecodeError:
        logger.warning("Lead message parsing returned invalid JSON")
        raw = {}
    if not isinstance(raw, dict):
        raw = {}

    def pick_id(key: str, options: list[dict]) -> Optional[str]:
        value = raw.get(key)
        return value if isinstance(value, str) and value in {o["id"] for o in options} else None

    def clean_str(key: str, max_len: int) -> Optional[str]:
        value = raw.get(key)
        value = " ".join(value.split()) if isinstance(value, str) else ""
        return value[:max_len] or None

    # A role name equal (case-insensitively) to an existing role always uses that role's spelling.
    role_name = clean_str("job_role_name", 500)
    if role_name:
        existing = {o["name"].lower(): o["name"] for o in job_roles}
        role_name = existing.get(role_name.lower(), role_name)

    company_id = pick_id("company_id", companies)
    company_name = clean_str("company_name", 255)
    if not company_id and company_name:
        existing = {o["name"].lower(): o["id"] for o in companies}
        company_id = existing.get(company_name.lower())

    round_value = raw.get("round")
    time_est = parse_time(clean_str("start_time", 20))

    return {
        "company_id": company_id,
        "company_name": company_name,
        "resume_profile_id": pick_id("resume_profile_id", resume_profiles),
        "candidate_id": pick_id("candidate_id", candidates),
        "job_role_name": role_name,
        "job_role_exists": bool(role_name and role_name in {o["name"] for o in job_roles}),
        "round": round_value if round_value in ROUND_OPTIONS else None,
        "interviewer": clean_str("interviewer", 255),
        "interview_date": resolve_date(raw.get("interview_date"), today),
        "time_est": time_est,
    }

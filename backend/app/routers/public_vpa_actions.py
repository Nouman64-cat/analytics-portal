"""Create-only actions for the VPA's mobile page (/public/vpa/<token>).

Two gates: the shared-secret URL token (same as the read-only schedule) plus a PIN. A correct
PIN is exchanged for a short-lived session token sent back in the X-VPA-Session header. That
token is signed with a key derived from JWT_SECRET_KEY and carries no user_id, so the main API's
get_current_user rejects it: it only ever works on the endpoints in this file.

What the VPA can do, all scoped to the AI/ML department:
  * search / add companies (by name only)
  * open a new lead
  * add an interview round to an open lead
  * reschedule (date/time only) an interview that hasn't happened yet
No edits to other fields, no deletes, no status/outcome changes. Every write is recorded in the
activity log under ACTOR_LABEL.
"""

import hashlib
import hmac
import threading
import time as time_mod
import uuid
from collections import deque
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlmodel import Session, func, or_, select

from app.activity_log import record_activity
from app.config import get_settings
from app.database import get_session
from app.email_ses import make_presigned_doc_url, try_send_interview_created_email
from app.interview_time import PKT, US_EASTERN, pkt_moment
from app.lead_thread_utils import effective_lead_fields, ensure_lead_thread, is_lead_terminal_outcome, load_lead_map
from app.models.business_developer import BusinessDeveloper
from app.models.candidate import Candidate
from app.models.company import Company
from app.models.department import Department
from app.models.interview import Interview
from app.models.interview_reminder_log import InterviewReminderLog
from app.models.resume_profile import ResumeProfile
from app.routers.public_vpa import AI_ML_DEPARTMENT_SLUG, _require_valid_token

router = APIRouter(prefix="/api/v1/public/vpa/{token}", tags=["Public VPA actions"])

ACTOR_LABEL = "vpa (mobile link)"
SESSION_DAYS = 30
SESSION_SCOPE = "vpa-write"
ROUNDS = ["Recruiter's Call", "Phone Screen", "1st", "2nd", "3rd", "4th", "5th", "6th", "Final"]

# ---- PIN brute-force protection (in-process; resets on restart, which is acceptable for a
# 4-6 digit PIN given the global cap below).
_FAIL_WINDOW_S = 15 * 60
_MAX_FAILS_PER_IP = 5
_MAX_FAILS_GLOBAL = 20
_fails_by_ip: dict[str, deque] = {}
_fails_global: deque = deque()
_fails_lock = threading.Lock()


def _prune(q: deque, now: float) -> None:
    while q and now - q[0] > _FAIL_WINDOW_S:
        q.popleft()


def _check_not_locked(ip: str) -> None:
    now = time_mod.monotonic()
    with _fails_lock:
        _prune(_fails_global, now)
        ip_q = _fails_by_ip.get(ip)
        if ip_q is not None:
            _prune(ip_q, now)
        if len(_fails_global) >= _MAX_FAILS_GLOBAL or (ip_q and len(ip_q) >= _MAX_FAILS_PER_IP):
            raise HTTPException(status_code=429, detail="Too many wrong PINs. Try again in 15 minutes.")


def _record_failure(ip: str) -> None:
    now = time_mod.monotonic()
    with _fails_lock:
        _fails_global.append(now)
        _fails_by_ip.setdefault(ip, deque()).append(now)


# ---- Session tokens


def _signing_key() -> str:
    # Distinct from the main API's key so a VPA token can never be confused for a login token.
    return f"{get_settings().JWT_SECRET_KEY}|public-vpa-session"


def _fingerprint() -> str:
    """Changes whenever the URL token or PIN changes, invalidating every issued session."""
    s = get_settings()
    raw = f"{s.PUBLIC_VPA_TOKEN}|{s.PUBLIC_VPA_PIN}".encode()
    return hashlib.sha256(raw).hexdigest()[:24]


def _configured_pin() -> str:
    pin = (get_settings().PUBLIC_VPA_PIN or "").strip()
    if not pin:
        raise HTTPException(status_code=403, detail="Adding from this page isn't enabled.")
    return pin


def require_vpa_session(
    token: str,
    x_vpa_session: Optional[str] = Header(default=None),
) -> None:
    _require_valid_token(token)
    _configured_pin()
    if not x_vpa_session:
        raise HTTPException(status_code=401, detail="PIN required")
    try:
        claims = jwt.decode(x_vpa_session, _signing_key(), algorithms=["HS256"])
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expired. Enter your PIN again.")
    if claims.get("scope") != SESSION_SCOPE or not hmac.compare_digest(
        str(claims.get("fp", "")), _fingerprint()
    ):
        raise HTTPException(status_code=401, detail="Session expired. Enter your PIN again.")


class PinIn(BaseModel):
    pin: str = Field(min_length=1, max_length=32)


@router.post("/session")
def create_session(token: str, body: PinIn, request: Request):
    _require_valid_token(token)
    pin = _configured_pin()
    ip = request.client.host if request.client else "unknown"
    _check_not_locked(ip)
    if not hmac.compare_digest(body.pin.strip(), pin):
        _record_failure(ip)
        raise HTTPException(status_code=401, detail="Wrong PIN")
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    session_token = jwt.encode(
        {"scope": SESSION_SCOPE, "fp": _fingerprint(), "exp": expires},
        _signing_key(),
        algorithm="HS256",
    )
    return {"session": session_token, "expires_at": expires.isoformat()}


@router.get("/session", dependencies=[Depends(require_vpa_session)])
def check_session():
    return {"ok": True}


# ---- Shared helpers


def _ai_dept(session: Session) -> Department:
    dept = session.exec(select(Department).where(Department.slug == AI_ML_DEPARTMENT_SLUG)).first()
    if not dept:
        raise HTTPException(status_code=409, detail="AI/ML department is not set up.")
    return dept


def _in_dept_ids(dept_id: uuid.UUID):
    """department_ids is a JSON list of UUID strings; a substring match is exact for UUIDs."""
    return lambda col: col.contains(str(dept_id))


def _candidate_in_dept(c: Candidate, dept_id: uuid.UUID) -> bool:
    return c.department_id == dept_id or str(dept_id) in (c.department_ids or "")


def _resolve_schedule(
    day: date, at: Optional[time], tz: Literal["est", "pkt"]
) -> tuple[date, Optional[time], Optional[time]]:
    """Normalize to the app's storage convention: (US Eastern date, time_est, time_pkt)."""
    if at is None:
        # Without a time there's nothing to convert; a PKT date is treated as the EST date.
        return day, None, None
    zone = US_EASTERN if tz == "est" else PKT
    moment = datetime.combine(day, at, zone)
    est = moment.astimezone(US_EASTERN)
    pkt = moment.astimezone(PKT)
    return est.date(), est.time().replace(tzinfo=None), pkt.time().replace(tzinfo=None)


def _thread_rows(session: Session, thread_id: uuid.UUID) -> list[Interview]:
    return list(session.exec(select(Interview).where(Interview.thread_id == thread_id)).all())


def _chain_tip(rows: list[Interview]) -> Interview:
    """Latest round in a thread: a row nothing else chains from (newest if several)."""
    parents = {r.parent_interview_id for r in rows if r.parent_interview_id}
    leaves = [r for r in rows if r.id not in parents] or rows
    return max(leaves, key=lambda r: r.created_at)


def _suggest_next_round(current: str) -> str:
    """Mirror of suggestNextRoundLabel in frontend/lib/utils.ts."""
    lower = current.strip().lower()
    if any(k in lower for k in ("recruiter", "screen", "phone", "intro")):
        return "1st"
    return {"1st": "2nd", "first": "2nd", "2nd": "3rd", "second": "3rd", "3rd": "4th",
            "third": "4th", "4th": "5th"}.get(lower, "")


def _clean(s: Optional[str]) -> Optional[str]:
    s = (s or "").strip()
    return s or None


# ---- Lookups (names only — no contact details, salaries, links or documents)


@router.get("/lookups", dependencies=[Depends(require_vpa_session)])
def lookups(session: Session = Depends(get_session)):
    dept = _ai_dept(session)
    in_dept = _in_dept_ids(dept.id)
    candidates = session.exec(
        select(Candidate)
        .where(Candidate.is_active == True)  # noqa: E712
        .where(or_(Candidate.department_id == dept.id, in_dept(Candidate.department_ids)))
        .order_by(Candidate.name)
    ).all()
    profiles = session.exec(
        select(ResumeProfile)
        .where(ResumeProfile.is_active == True, ResumeProfile.department_id == dept.id)  # noqa: E712
        .order_by(ResumeProfile.name)
    ).all()
    bds = session.exec(
        select(BusinessDeveloper)
        .where(BusinessDeveloper.is_active == True)  # noqa: E712
        .where(or_(BusinessDeveloper.department_ids.is_(None), in_dept(BusinessDeveloper.department_ids)))
        .order_by(BusinessDeveloper.name)
    ).all()
    return {
        "candidates": [{"id": str(c.id), "name": c.name} for c in candidates],
        "resume_profiles": [
            {"id": str(p.id), "name": p.name, "bd_id": str(p.bd_id) if p.bd_id else None}
            for p in profiles
        ],
        "bds": [{"id": str(b.id), "name": b.name} for b in bds],
        "rounds": ROUNDS,
    }


@router.get("/companies", dependencies=[Depends(require_vpa_session)])
def search_companies(q: str = Query(default="", max_length=100), session: Session = Depends(get_session)):
    q = q.strip()
    if not q:
        return []
    rows = session.exec(
        select(Company).where(Company.name.ilike(f"%{q}%")).order_by(Company.name).limit(15)
    ).all()
    return [{"id": str(c.id), "name": c.name} for c in rows]


class CompanyIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)


@router.post("/companies", dependencies=[Depends(require_vpa_session)])
def add_company(body: CompanyIn, session: Session = Depends(get_session)):
    name = " ".join(body.name.split())
    if not name:
        raise HTTPException(status_code=400, detail="Company name is required")
    existing = session.exec(select(Company).where(func.lower(Company.name) == name.lower())).first()
    if existing:
        return {"id": str(existing.id), "name": existing.name, "created": False}
    company = Company(name=name)
    session.add(company)
    session.flush()
    record_activity(
        session, actor=None, actor_label=ACTOR_LABEL, action="create_company",
        entity_type="company", entity_id=company.id, message=f"Created company '{name}' (VPA page)",
    )
    session.commit()
    return {"id": str(company.id), "name": company.name, "created": True}


@router.get("/leads", dependencies=[Depends(require_vpa_session)])
def open_leads(q: str = Query(default="", max_length=100), session: Session = Depends(get_session)):
    """Open AI/ML leads to attach a new round to — most recently active first."""
    dept = _ai_dept(session)
    rows = session.exec(
        select(Interview)
        .where(Interview.department_id == dept.id)
        .where(Interview.created_at >= datetime.utcnow() - timedelta(days=180))
    ).all()
    by_thread: dict[uuid.UUID, list[Interview]] = {}
    for r in rows:
        by_thread.setdefault(r.thread_id, []).append(r)

    lead_map = load_lead_map(session, set(by_thread))
    tips = {tid: _chain_tip(rs) for tid, rs in by_thread.items()}
    company_names = {
        c.id: c.name
        for c in session.exec(
            select(Company).where(Company.id.in_({t.company_id for t in tips.values()}))
        ).all()
    } if tips else {}
    cand_ids = {r.candidate_id for r in rows if r.candidate_id}
    cand_names = {
        c.id: c.name for c in session.exec(select(Candidate).where(Candidate.id.in_(cand_ids))).all()
    } if cand_ids else {}

    needle = q.strip().lower()
    out = []
    for tid, tip in tips.items():
        outcome = effective_lead_fields(session, tid, lead_map.get(tid), by_thread[tid])["lead_outcome"]
        if is_lead_terminal_outcome(outcome):
            continue
        company = (company_names.get(tip.company_id) or "").strip()
        # Most recent candidate on the thread, so the form can pre-fill it.
        with_cand = [r for r in by_thread[tid] if r.candidate_id]
        cand_id = max(with_cand, key=lambda r: r.created_at).candidate_id if with_cand else None
        if needle and needle not in f"{company} {tip.role}".lower():
            continue
        out.append({
            "thread_id": str(tid),
            "company": company or "Unknown company",
            "role": tip.role,
            "latest_round": tip.round,
            "latest_date": tip.interview_date.isoformat() if tip.interview_date else None,
            "candidate_id": str(cand_id) if cand_id else None,
            "candidate": cand_names.get(cand_id) if cand_id else None,
            "suggested_round": _suggest_next_round(tip.round),
            "_sort": max(r.updated_at for r in by_thread[tid]),
        })
    out.sort(key=lambda x: x.pop("_sort"), reverse=True)
    return out[:40]


# ---- Writes


class LeadIn(BaseModel):
    company_id: uuid.UUID
    role: str = Field(min_length=1, max_length=500)
    resume_profile_id: uuid.UUID
    bd_id: Optional[uuid.UUID] = None
    candidate_id: Optional[uuid.UUID] = None
    salary_range: Optional[str] = Field(default=None, max_length=255)
    arrived_on: Optional[date] = None


@router.post("/leads", status_code=201, dependencies=[Depends(require_vpa_session)])
def create_lead(body: LeadIn, session: Session = Depends(get_session)):
    """Mirrors POST /api/v1/leads: a LeadThread plus its initial round, stamped to AI/ML."""
    dept = _ai_dept(session)
    company = session.get(Company, body.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    profile = session.get(ResumeProfile, body.resume_profile_id)
    if not profile or profile.department_id != dept.id:
        raise HTTPException(status_code=404, detail="Resume profile not found")
    if body.bd_id and not session.get(BusinessDeveloper, body.bd_id):
        raise HTTPException(status_code=404, detail="Business developer not found")
    if body.candidate_id:
        cand = session.get(Candidate, body.candidate_id)
        if not cand or not _candidate_in_dept(cand, dept.id):
            raise HTTPException(status_code=404, detail="Candidate not found")

    role = body.role.strip()
    arrived = body.arrived_on or datetime.now(PKT).date()
    thread_id = uuid.uuid4()
    lt = ensure_lead_thread(session, thread_id)
    lt.entertaining_candidate_id = body.candidate_id
    lt.arrived_on = arrived
    lt.updated_at = datetime.utcnow()
    session.add(lt)
    interview = Interview(
        thread_id=thread_id,
        company_id=company.id,
        candidate_id=body.candidate_id,
        resume_profile_id=profile.id,
        role=role,
        round="1st",
        status="Upcoming",
        salary_range=_clean(body.salary_range),
        bd_id=body.bd_id,
        interview_date=arrived,
        department_id=dept.id,
    )
    session.add(interview)
    session.flush()
    record_activity(
        session, actor=None, actor_label=ACTOR_LABEL, action="create_lead",
        entity_type="lead_thread", entity_id=thread_id,
        message=f"Created lead '{role}' at '{company.name}' (VPA page)",
    )
    session.commit()
    return {"thread_id": str(thread_id), "company": company.name, "role": role}


class ScheduleFields(BaseModel):
    day: date
    at: Optional[time] = None
    # Which clock `day`/`at` were entered in.
    tz: Literal["est", "pkt"] = "est"


class RoundIn(ScheduleFields):
    thread_id: uuid.UUID
    candidate_id: uuid.UUID
    round: str = Field(min_length=1, max_length=100)
    duration_minutes: int = Field(default=30, ge=5, le=480)
    interviewer: Optional[str] = Field(default=None, max_length=255)
    is_phone_call: bool = False


def _send_schedule_email(session: Session, interview_id: uuid.UUID) -> None:
    i = session.get(Interview, interview_id)
    cand = i.candidate
    if not cand or not cand.email:
        return
    s = get_settings()
    try_send_interview_created_email(
        s,
        to_email=cand.email,
        candidate_name=cand.name or "Candidate",
        company_name=i.company.name if i.company else "",
        role=i.role,
        round_name=i.round,
        interview_date=i.interview_date,
        time_est=i.time_est,
        time_pkt=i.time_pkt,
        interviewer=i.interviewer,
        interview_link=i.interview_link,
        is_phone_call=i.is_phone_call,
        salary_range=i.salary_range or None,
        interview_doc_url=make_presigned_doc_url(s, i.interview_doc_url),
        bd_name=i.business_developer.name if i.business_developer else None,
        resume_profile_name=i.resume_profile.name if i.resume_profile else None,
    )


@router.post("/interviews", status_code=201, dependencies=[Depends(require_vpa_session)])
def add_round(body: RoundIn, session: Session = Depends(get_session)):
    """Mirrors adding a follow-up round on the Interviews page: chains to the thread's latest
    round (which becomes Converted) and inherits company, profile, role, BD and salary."""
    dept = _ai_dept(session)
    rows = _thread_rows(session, body.thread_id)
    if not rows or any(r.department_id != dept.id for r in rows):
        raise HTTPException(status_code=404, detail="Lead not found")
    lead_row = load_lead_map(session, {body.thread_id}).get(body.thread_id)
    if is_lead_terminal_outcome(effective_lead_fields(session, body.thread_id, lead_row, rows)["lead_outcome"]):
        raise HTTPException(status_code=409, detail="This lead is closed. Ask an admin to reopen it.")
    cand = session.get(Candidate, body.candidate_id)
    if not cand or not _candidate_in_dept(cand, dept.id):
        raise HTTPException(status_code=404, detail="Candidate not found")

    parent = _chain_tip(rows)
    day, t_est, t_pkt = _resolve_schedule(body.day, body.at, body.tz)
    interview = Interview(
        thread_id=parent.thread_id,
        parent_interview_id=parent.id,
        company_id=parent.company_id,
        candidate_id=cand.id,
        resume_profile_id=parent.resume_profile_id,
        role=parent.role,
        salary_range=parent.salary_range,
        bd_id=parent.bd_id,
        round=body.round.strip(),
        interview_date=day,
        time_est=t_est,
        time_pkt=t_pkt,
        duration_minutes=body.duration_minutes,
        interviewer=_clean(body.interviewer),
        is_phone_call=body.is_phone_call,
        department_id=dept.id,
    )
    session.add(interview)
    parent.status = "Converted"
    parent.updated_at = datetime.utcnow()
    session.add(parent)
    session.flush()
    company = session.get(Company, parent.company_id)
    record_activity(
        session, actor=None, actor_label=ACTOR_LABEL, action="create_interview",
        entity_type="interview", entity_id=interview.id,
        message=f"Created interview '{interview.round}' for '{interview.role}' at "
                f"'{company.name if company else 'Unknown company'}' (VPA page)",
    )
    session.commit()
    _send_schedule_email(session, interview.id)
    return {"id": str(interview.id)}


@router.patch("/interviews/{interview_id}/schedule", dependencies=[Depends(require_vpa_session)])
def reschedule(interview_id: uuid.UUID, body: ScheduleFields, session: Session = Depends(get_session)):
    """Move an upcoming AI/ML interview. Only date/time change; everything else is untouched."""
    dept = _ai_dept(session)
    interview = session.get(Interview, interview_id)
    if not interview or interview.department_id != dept.id:
        raise HTTPException(status_code=404, detail="Interview not found")

    now_pkt = datetime.now(PKT).replace(tzinfo=None)
    if interview.interview_date:
        old_day, old_time = pkt_moment(interview)
        if old_time:
            old_end = datetime.combine(old_day, old_time) + timedelta(
                minutes=interview.duration_minutes or 30
            )
        else:
            old_end = datetime.combine(old_day, time.max)
        if old_end < now_pkt:
            raise HTTPException(status_code=409, detail="This interview has already happened.")

    day, t_est, t_pkt = _resolve_schedule(body.day, body.at, body.tz)
    if day < datetime.now(US_EASTERN).date():
        raise HTTPException(status_code=400, detail="Pick a date that hasn't passed yet.")
    before = f"{interview.interview_date} {interview.time_est or ''}".strip()
    interview.interview_date = day
    interview.time_est = t_est
    interview.time_pkt = t_pkt
    interview.updated_at = datetime.utcnow()
    session.add(interview)
    # New time → the 60/30-minute reminders should fire again.
    for log in session.exec(
        select(InterviewReminderLog).where(InterviewReminderLog.interview_id == interview.id)
    ).all():
        session.delete(log)
    record_activity(
        session, actor=None, actor_label=ACTOR_LABEL, action="update_interview",
        entity_type="interview", entity_id=interview.id,
        message=f"Rescheduled '{interview.round}' for '{interview.role}' from {before} to "
                f"{day} {t_est or ''} EST (VPA page)".rstrip(),
    )
    session.commit()
    _send_schedule_email(session, interview.id)
    return {"id": str(interview.id)}

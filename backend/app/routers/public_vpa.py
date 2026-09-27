"""Unauthenticated, read-only AI/ML interview schedule for the virtual assistant.

Gated only by a shared-secret token in the URL (settings.PUBLIC_VPA_TOKEN) — backs the
/public/vpa/<token> page the VPA opens on her phone to know whom to remind and when. Only the
fields needed for a reminder call are returned: no meeting links, documents, salaries, emails
or feedback.

"Today" follows the app's existing convention (see reminder_worker._pkt_to_utc): the stored
interview_date paired with time_pkt is the Pakistan-time moment of the interview.
Callers pass an optional start/end date range (defaults to today, capped at MAX_RANGE_DAYS).
"""

import hmac
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlmodel import Session, select

from app.config import get_settings
from app.database import get_session
from app.models.business_developer import BusinessDeveloper
from app.models.candidate import Candidate
from app.models.company import Company
from app.models.department import Department
from app.models.interview import Interview
from app.models.resume_profile import ResumeProfile
from app.status_utils import computed_status_for_interview_display

router = APIRouter(prefix="/api/v1/public", tags=["Public VPA"])

AI_ML_DEPARTMENT_SLUG = "ai"
PKT = timezone(timedelta(hours=5))
# Enough for a month grid plus padding; keeps a crafted URL from pulling the whole table.
MAX_RANGE_DAYS = 62


def _require_valid_token(token: str) -> None:
    configured = get_settings().PUBLIC_VPA_TOKEN
    # 404 (not 403), same as public_stats: a guessed token learns nothing about the feature.
    if not configured or not hmac.compare_digest(token, configured):
        raise HTTPException(status_code=404, detail="Not found")


def _hhmm(t) -> str | None:
    return t.strftime("%H:%M") if t else None


@router.get("/vpa/{token}")
def get_vpa_schedule(
    token: str,
    response: Response,
    session: Session = Depends(get_session),
    start: Optional[date] = Query(default=None),
    end: Optional[date] = Query(default=None),
):
    _require_valid_token(token)
    response.headers["Cache-Control"] = "no-store"

    now_pkt = datetime.now(PKT)
    today_pkt = now_pkt.date()
    start = start or today_pkt
    end = end or start
    if end < start or (end - start).days >= MAX_RANGE_DAYS:
        raise HTTPException(status_code=400, detail=f"Date range must be 1-{MAX_RANGE_DAYS} days")

    dept = session.exec(
        select(Department).where(Department.slug == AI_ML_DEPARTMENT_SLUG)
    ).first()
    if not dept:
        interviews: list[Interview] = []
    else:
        interviews = session.exec(
            select(Interview).where(
                Interview.department_id == dept.id,
                Interview.interview_date >= start,
                Interview.interview_date <= end,
            )
        ).all()

    candidate_ids = {i.candidate_id for i in interviews if i.candidate_id}
    company_ids = {i.company_id for i in interviews}
    bd_ids = {i.bd_id for i in interviews if i.bd_id}
    profile_ids = {i.resume_profile_id for i in interviews}
    candidates = (
        {c.id: c.name for c in session.exec(select(Candidate).where(Candidate.id.in_(candidate_ids))).all()}
        if candidate_ids
        else {}
    )
    companies = (
        {c.id: c.name for c in session.exec(select(Company).where(Company.id.in_(company_ids))).all()}
        if company_ids
        else {}
    )
    bds = (
        {b.id: b.name for b in session.exec(select(BusinessDeveloper).where(BusinessDeveloper.id.in_(bd_ids))).all()}
        if bd_ids
        else {}
    )
    profiles = (
        {p.id: p.name for p in session.exec(select(ResumeProfile).where(ResumeProfile.id.in_(profile_ids))).all()}
        if profile_ids
        else {}
    )

    # By day, then timed interviews in PKT order; untimed ones trail at the end of their day.
    interviews.sort(
        key=lambda i: (i.interview_date, i.time_pkt is None, i.time_pkt or datetime.min.time())
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "date_pkt": today_pkt.isoformat(),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "now_pkt": now_pkt.strftime("%H:%M"),
        "department": dept.name if dept else None,
        "interviews": [
            {
                "id": str(i.id),
                "date": i.interview_date.isoformat(),
                "time_pkt": _hhmm(i.time_pkt),
                "time_est": _hhmm(i.time_est),
                "duration_minutes": i.duration_minutes,
                "candidate": candidates.get(i.candidate_id) if i.candidate_id else None,
                "resume_profile": profiles.get(i.resume_profile_id),
                "company": companies.get(i.company_id),
                "role": i.role,
                "round": i.round,
                "bd": bds.get(i.bd_id) if i.bd_id else None,
                "interviewer": i.interviewer,
                "is_phone_call": i.is_phone_call,
                "status": computed_status_for_interview_display(
                    i.status, i.interview_date, i.created_at
                ),
            }
            for i in interviews
        ],
    }

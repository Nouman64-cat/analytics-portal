"""Notifications for BD and superadmin: leads that need follow-up."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select, or_, and_

from app.database import get_session
from app.deps import get_current_user
from app.models.candidate import Candidate
from app.models.company import Company
from app.models.interview import Interview
from app.models.lead_thread import LeadThread
from app.models.user import User, UserRole
from app.reminder_worker import UNRESPONSIVE_FOLLOWUP_DAYS

router = APIRouter(
    prefix="/api/v1/notifications",
    tags=["Notifications"],
    dependencies=[Depends(get_current_user)],
)


class UnresponsiveLeadNotification(BaseModel):
    thread_id: uuid.UUID
    company_name: str
    role: str
    candidate_name: Optional[str]
    days_unresponsive: int


def _require_bd_or_superadmin(current_user: User) -> None:
    if current_user.role not in (UserRole.BD, UserRole.SUPERADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only BD and superadmin users can access notifications.",
        )


@router.get("/unresponsive-leads", response_model=list[UnresponsiveLeadNotification])
def get_unresponsive_lead_notifications(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[UnresponsiveLeadNotification]:
    """Return all leads that have been Unresponsive for 15+ days.

    Restricted to BD and superadmin only.
    """
    _require_bd_or_superadmin(current_user)

    cutoff = datetime.utcnow() - timedelta(days=UNRESPONSIVE_FOLLOWUP_DAYS)
    leads = session.exec(
        select(LeadThread).where(
            LeadThread.outcome_override == "unresponsive",
            or_(
                and_(
                    LeadThread.unresponsive_since.isnot(None),
                    LeadThread.unresponsive_since <= cutoff,
                ),
                and_(
                    LeadThread.unresponsive_since.is_(None),
                    LeadThread.updated_at <= cutoff,
                ),
            ),
        )
    ).all()

    if not leads:
        return []

    # Load one representative interview per thread
    thread_ids = [lt.thread_id for lt in leads]
    interviews = session.exec(
        select(Interview).where(Interview.thread_id.in_(thread_ids))
    ).all()
    thread_interview: dict = {}
    for iv in interviews:
        if iv.thread_id not in thread_interview:
            thread_interview[iv.thread_id] = iv

    company_ids = {iv.company_id for iv in thread_interview.values() if iv.company_id}
    candidate_ids = {iv.candidate_id for iv in thread_interview.values() if iv.candidate_id}
    company_map = {
        c.id: c for c in session.exec(select(Company).where(Company.id.in_(company_ids))).all()
    }
    candidate_map = {
        c.id: c for c in session.exec(select(Candidate).where(Candidate.id.in_(candidate_ids))).all()
    }

    now_utc = datetime.utcnow()
    result: list[UnresponsiveLeadNotification] = []
    for lead in leads:
        iv = thread_interview.get(lead.thread_id)
        company_name = company_map[iv.company_id].name if iv and iv.company_id in company_map else "Unknown"
        role = iv.role if iv else "Unknown"
        candidate = candidate_map.get(iv.candidate_id) if iv and iv.candidate_id else None
        candidate_name = candidate.name if candidate else None
        since = lead.unresponsive_since or lead.updated_at
        days_unresponsive = max(1, (now_utc - since).days)

        result.append(
            UnresponsiveLeadNotification(
                thread_id=lead.thread_id,
                company_name=company_name,
                role=role,
                candidate_name=candidate_name,
                days_unresponsive=days_unresponsive,
            )
        )

    result.sort(key=lambda x: x.days_unresponsive, reverse=True)
    return result

"""Notifications for BD and superadmin: leads that need follow-up."""

from __future__ import annotations

from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.models.candidate import Candidate
from app.models.company import Company
from app.models.interview import Interview
from app.models.notification_read import NotificationRead
from app.models.user import User, UserRole
from app.unresponsive_utils import find_unresponsive_leads_needing_followup

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
    is_read: bool


def _require_bd_or_superadmin(current_user: User) -> None:
    if current_user.role not in (UserRole.BD, UserRole.SUPERADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only BD and superadmin users can access notifications.",
        )


def _build_notifications(
    session: Session,
    current_user: User,
) -> list[UnresponsiveLeadNotification]:
    qualifying = find_unresponsive_leads_needing_followup(session)
    if not qualifying:
        return []

    thread_ids = [info.thread_id for info in qualifying]

    # Load read state for this user in one query
    read_thread_ids: set[uuid.UUID] = {
        r.thread_id
        for r in session.exec(
            select(NotificationRead).where(
                NotificationRead.user_id == current_user.id,
                NotificationRead.thread_id.in_(thread_ids),
            )
        ).all()
    }

    # Load one representative interview per thread for company/role/candidate
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

    result: list[UnresponsiveLeadNotification] = []
    for info in qualifying:
        iv = thread_interview.get(info.thread_id)
        company_name = company_map[iv.company_id].name if iv and iv.company_id in company_map else "Unknown"
        role = iv.role if iv else "Unknown"
        candidate = candidate_map.get(iv.candidate_id) if iv and iv.candidate_id else None
        candidate_name = candidate.name if candidate else None

        result.append(
            UnresponsiveLeadNotification(
                thread_id=info.thread_id,
                company_name=company_name,
                role=role,
                candidate_name=candidate_name,
                days_unresponsive=info.days_unresponsive,
                is_read=info.thread_id in read_thread_ids,
            )
        )

    # Unread first, then sort by days descending within each group
    result.sort(key=lambda n: (n.is_read, -n.days_unresponsive))
    return result


@router.get("/unresponsive-leads", response_model=list[UnresponsiveLeadNotification])
def get_unresponsive_lead_notifications(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[UnresponsiveLeadNotification]:
    """Return all leads unresponsive for 15+ days with per-user read state."""
    _require_bd_or_superadmin(current_user)
    return _build_notifications(session, current_user)


@router.post("/unresponsive-leads/{thread_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_notification_read(
    thread_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    """Mark a single notification as read for the current user."""
    _require_bd_or_superadmin(current_user)

    existing = session.exec(
        select(NotificationRead).where(
            NotificationRead.user_id == current_user.id,
            NotificationRead.thread_id == thread_id,
        )
    ).first()
    if not existing:
        session.add(NotificationRead(user_id=current_user.id, thread_id=thread_id))
        session.commit()


@router.post("/unresponsive-leads/mark-all-read", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_notifications_read(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    """Mark all current unresponsive-lead notifications as read for the current user."""
    _require_bd_or_superadmin(current_user)

    qualifying = find_unresponsive_leads_needing_followup(session)
    if not qualifying:
        return

    thread_ids = [info.thread_id for info in qualifying]
    already_read: set[uuid.UUID] = {
        r.thread_id
        for r in session.exec(
            select(NotificationRead).where(
                NotificationRead.user_id == current_user.id,
                NotificationRead.thread_id.in_(thread_ids),
            )
        ).all()
    }

    new_reads = [
        NotificationRead(user_id=current_user.id, thread_id=tid)
        for tid in thread_ids
        if tid not in already_read
    ]
    if new_reads:
        for r in new_reads:
            session.add(r)
        session.commit()

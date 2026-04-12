"""Interview visibility for team-member users: same person as Candidate (email match)."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import false as sql_false
from sqlalchemy import func
from sqlmodel import Session, select

from app.models.candidate import Candidate
from app.models.interview import Interview
from app.models.user import User, UserRole


def candidate_id_for_team_member(session: Session, user: User) -> Optional[uuid.UUID]:
    """Return the Candidate row id whose email matches the user's login email (case-insensitive)."""
    if user.role != UserRole.TEAM_MEMBER:
        return None
    if not user.email:
        return None
    cand = session.exec(
        select(Candidate).where(
            func.lower(Candidate.email) == user.email.lower()
        )
    ).first()
    return cand.id if cand else None


def team_member_must_own_interview(
    session: Session, user: User, interview: Interview
) -> None:
    """For writes: 403/404 unless this interview belongs to the team member's candidate."""
    if user.role != UserRole.TEAM_MEMBER:
        return
    cid = candidate_id_for_team_member(session, user)
    if cid is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No candidate record matches your account email; contact an admin.",
        )
    if interview.candidate_id != cid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found"
        )


def team_member_can_read_interview(
    session: Session, user: User, interview: Interview
) -> bool:
    """Team members may load full detail only for interviews tied to their candidate row."""
    if user.role != UserRole.TEAM_MEMBER:
        return True
    cid = candidate_id_for_team_member(session, user)
    if cid is None:
        return False
    return interview.candidate_id == cid


def team_member_can_access_thread(
    session: Session, user: User, thread_id: uuid.UUID
) -> bool:
    """True if a team member has at least one interview in this thread (their candidate)."""
    if user.role != UserRole.TEAM_MEMBER:
        return True
    cid = candidate_id_for_team_member(session, user)
    if cid is None:
        return False
    return session.exec(
        select(Interview.id).where(
            Interview.thread_id == thread_id,
            Interview.candidate_id == cid,
        )
    ).first() is not None


def apply_team_member_interview_list_filter(session: Session, user: User, query):
    """List: team members only see interviews for their own candidate (not other rounds in the thread)."""
    if user.role != UserRole.TEAM_MEMBER:
        return query
    cid = candidate_id_for_team_member(session, user)
    if cid is None:
        return query.where(sql_false())
    return query.where(Interview.candidate_id == cid)

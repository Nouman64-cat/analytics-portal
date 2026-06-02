"""BD team hierarchy scope helpers — ownership enforcement for BD and BD Team Lead roles."""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from app.models.user import User, UserRole


def get_bd_entity_scope(user: User, session: Session) -> Optional[list[uuid.UUID]]:
    """Return the set of BusinessDeveloper IDs this user may read/write, or None for no restriction.

    None  → no BD-based restriction (other roles, or BD without bd_entity_id → backward compat).
    list  → only leads/interviews attributed to these BD entity IDs are accessible.
    """
    if user.role == UserRole.BD:
        if not user.bd_entity_id:
            return None  # not yet linked — backward compat, no restriction
        return [user.bd_entity_id]

    if user.role == UserRole.BD_TEAM_LEAD:
        if not user.bd_entity_id:
            return None  # not yet linked — backward compat
        members = session.exec(
            select(User).where(User.team_lead_user_id == user.id)
        ).all()
        scope = [user.bd_entity_id]
        for m in members:
            if m.bd_entity_id and m.bd_entity_id not in scope:
                scope.append(m.bd_entity_id)
        return scope

    return None  # other roles: no BD-based restriction


def assert_bd_lead_write_access(
    user: User,
    lead_primary_bd_id: Optional[uuid.UUID],
    session: Session,
) -> None:
    """Raise HTTP 403 if a BD/BD_TEAM_LEAD tries to write a lead outside their scope.

    No-op for roles that have no BD-based restriction, or when bd_entity_id is not configured
    (backward compat — unlinked BD users retain their current broad write access).
    """
    if user.role not in (UserRole.BD, UserRole.BD_TEAM_LEAD):
        return
    scope = get_bd_entity_scope(user, session)
    if scope is None:
        return  # not yet linked — backward compat
    if lead_primary_bd_id not in scope:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only modify leads attributed to you or your team.",
        )

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
    from sqlalchemy import func, or_
    from app.models.business_developer import BusinessDeveloper

    def _fallback_bd_id() -> Optional[uuid.UUID]:
        bd = session.exec(
            select(BusinessDeveloper).where(func.lower(BusinessDeveloper.email) == user.email.lower())
        ).first()
        if not bd:
            bd = session.exec(
                select(BusinessDeveloper).where(
                    or_(
                        func.lower(BusinessDeveloper.name) == user.full_name.lower(),
                        func.lower(user.full_name).contains(func.lower(BusinessDeveloper.name)),
                        func.lower(BusinessDeveloper.name).contains(func.lower(user.full_name))
                    )
                )
            ).first()
        return bd.id if bd else None

    if user.role == UserRole.BD:
        if not user.bd_entity_id:
            fb = _fallback_bd_id()
            return [fb] if fb else None
        return [user.bd_entity_id]

    if user.role == UserRole.BD_TEAM_LEAD:
        base_id = user.bd_entity_id or _fallback_bd_id()
        scope = [base_id] if base_id else []
        
        members = session.exec(
            select(User).where(User.team_lead_user_id == user.id)
        ).all()
        for m in members:
            # For members, try their direct link or fallback
            m_id = m.bd_entity_id
            if not m_id:
                mbd = session.exec(select(BusinessDeveloper).where(func.lower(BusinessDeveloper.email) == m.email.lower())).first()
                if mbd: m_id = mbd.id
            if m_id and m_id not in scope:
                scope.append(m_id)
                
        return scope if scope else None

    return None  # other roles: no BD-based restriction


def other_bd_user_ids_select(user: User):
    """Select the IDs of every OTHER BD-type user (BD or BD_TEAM_LEAD), excluding `user`.

    Used to exclude rows created by sibling BDs from the "attributed to my BD entity"
    visibility path. Keying on role (not on the bd_entity_id column) is deliberate:
    a BD's entity is often resolved via the email/name fallback in get_bd_entity_scope
    when bd_entity_id is not physically set. An exclusion keyed on User.bd_entity_id
    would then miss those siblings and leak their leads/interviews to each other.
    """
    return select(User.id).where(
        User.role.in_([UserRole.BD, UserRole.BD_TEAM_LEAD]),
        User.id != user.id,
    )


def is_superadmin_linked_bd(user: User, session: Session) -> bool:
    """Return True if user is a BD whose team lead is a SUPERADMIN."""
    if user.role != UserRole.BD:
        return False
    if not user.team_lead_user_id:
        return False
    lead = session.get(User, user.team_lead_user_id)
    return lead is not None and lead.role == UserRole.SUPERADMIN


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

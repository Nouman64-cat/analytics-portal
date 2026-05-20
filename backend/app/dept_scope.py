"""Department-level visibility: cross-dept roles see all; team members see their own dept only."""
from __future__ import annotations

import json
import uuid
from typing import Optional

from sqlalchemy import false as sql_false

from app.models.user import User, UserRole

CROSS_DEPT_ROLES = frozenset({UserRole.SUPERADMIN, UserRole.MANAGER, UserRole.BD})


def is_cross_dept(user: User) -> bool:
    return user.role in CROSS_DEPT_ROLES


def get_user_allowed_depts(user: User) -> Optional[list[uuid.UUID]]:
    """
    Resolve which departments this user may access.

    Returns None  → all departments (no filter applied).
    Returns list  → restrict to those UUIDs (empty list = no access at all).

    Priority:
    1. user.allowed_dept_ids JSON column (explicit assignment for BD / BD_TEAM_LEAD).
    2. Cross-dept role default → None (all).
    3. Scoped role → [user.department_id] or [] if no dept assigned.
    """
    if user.allowed_dept_ids is not None:
        try:
            ids: list = json.loads(user.allowed_dept_ids)
            if not ids:
                return None  # empty list means "All"
            return [uuid.UUID(str(d)) for d in ids]
        except Exception:
            pass  # malformed — fall through to role default

    if is_cross_dept(user):
        return None  # all departments

    if user.department_id:
        return [user.department_id]

    return []  # no dept assigned → no access


def apply_dept_filter(query, model, user: User, dept_id: Optional[uuid.UUID] = None):
    """
    Apply department scoping to a SQLModel select() query.

    Respects user.allowed_dept_ids first, then falls back to role defaults.
    Cross-dept roles (superadmin / manager / bd) without an explicit allowed_dept_ids
    see all rows. BD / BD_TEAM_LEAD with an explicit list are restricted to those depts.
    """
    allowed = get_user_allowed_depts(user)

    if allowed is None:
        # All departments
        if dept_id:
            return query.where(model.department_id == dept_id)
        return query

    if not allowed:
        # No departments at all
        return query.where(sql_false())

    # Specific list of departments
    if dept_id:
        if dept_id in allowed:
            return query.where(model.department_id == dept_id)
        return query.where(sql_false())

    return query.where(model.department_id.in_(allowed))

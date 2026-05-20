"""Department-level visibility: cross-dept roles see all; team members see their own dept only."""
from __future__ import annotations

import json
import uuid
from typing import Optional

from sqlalchemy import false as sql_false

from app.models.user import User, UserRole

CROSS_DEPT_ROLES = frozenset({UserRole.SUPERADMIN, UserRole.MANAGER})


def is_cross_dept(user: User) -> bool:
    return user.role in CROSS_DEPT_ROLES


def get_user_allowed_depts(user: User) -> Optional[list[uuid.UUID]]:
    """
    Resolve which departments this user may access.

    Returns None  → all departments (no filter applied).
    Returns list  → restrict to those UUIDs (empty list = no access at all).

    Priority:
    1. user.allowed_dept_ids JSON column (explicit assignment for BD / BD_TEAM_LEAD).
    2. Cross-dept role (superadmin / manager) → None (all).
    3. BD with no allowed_dept_ids:
       - has department_id → restricted to that dept
       - no department_id  → cross-dept (backwards-compat default)
    4. Other scoped roles → [department_id] or [] if unassigned.
    """
    if user.allowed_dept_ids is not None:
        try:
            ids: list = json.loads(user.allowed_dept_ids)
            if not ids:
                return None  # [] = All departments
            return [uuid.UUID(str(d)) for d in ids]
        except Exception:
            pass  # malformed — fall through to role default

    if user.role in CROSS_DEPT_ROLES:
        return None  # all departments

    if user.department_id:
        return [user.department_id]

    # BD with no explicit assignment and no department_id: cross-dept by default
    # (preserves backwards-compat for existing BD accounts).
    if user.role == UserRole.BD:
        return None

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

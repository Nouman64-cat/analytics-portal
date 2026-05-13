"""Department-level visibility: cross-dept roles see all; team members see their own dept only."""
from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import false as sql_false

from app.models.user import User, UserRole

CROSS_DEPT_ROLES = frozenset({UserRole.SUPERADMIN, UserRole.MANAGER, UserRole.BD})


def is_cross_dept(user: User) -> bool:
    return user.role in CROSS_DEPT_ROLES


def apply_dept_filter(query, model, user: User, dept_id: Optional[uuid.UUID] = None):
    """
    Apply department scoping to a SQLModel select() query.

    Cross-dept roles (superadmin / manager / bd):
      - Return all rows by default.
      - Honour the optional dept_id filter when provided.

    Team members:
      - Always scoped to user.department_id.
      - Return empty set if the user has no department assigned yet.
    """
    if is_cross_dept(user):
        if dept_id:
            return query.where(model.department_id == dept_id)
        return query

    if user.department_id is None:
        return query.where(sql_false())
    return query.where(model.department_id == user.department_id)

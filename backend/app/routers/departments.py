import json
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.dept_scope import get_user_allowed_depts
from app.models.department import Department
from app.models.user import User, UserRole
from app.schemas.department import DepartmentCreate, DepartmentRead, DepartmentUpdate

router = APIRouter(
    prefix="/api/v1/departments",
    tags=["Departments"],
    dependencies=[Depends(get_current_user)],
)

# Roles allowed to create/update/deactivate departments. Tech stack managers are
# further restricted to the departments assigned to them via allowed_dept_ids
# (see _assert_dept_in_scope) — superadmin is unrestricted.
_DEPT_MANAGE_ROLES = (UserRole.SUPERADMIN, UserRole.TECH_STACK_MANAGER)


def _require_dept_manage_role(current_user: User) -> None:
    if current_user.role not in _DEPT_MANAGE_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only superadmins and tech stack managers can manage departments",
        )


def _assert_dept_in_scope(current_user: User, dept_id: uuid.UUID, session: Session) -> None:
    """Raise 403 if a tech stack manager isn't assigned to this department.

    Superadmin is always unrestricted. get_user_allowed_depts returns None for
    unrestricted access or a concrete (never empty — see dept_scope.py) list of
    UUIDs otherwise, so membership is a straightforward containment check.
    """
    if current_user.role == UserRole.SUPERADMIN:
        return
    allowed = get_user_allowed_depts(current_user, session)
    if allowed is not None and dept_id not in allowed:
        raise HTTPException(status_code=403, detail="This department is not assigned to you")


def _grant_dept_access(current_user: User, dept_id: uuid.UUID, session: Session) -> None:
    """Auto-assign a newly created department to its tech-stack-manager creator
    so it immediately shows up in their scope, without granting access to any
    other department they weren't already assigned to."""
    if current_user.role != UserRole.TECH_STACK_MANAGER:
        return
    try:
        current_ids: list = json.loads(current_user.allowed_dept_ids) if current_user.allowed_dept_ids else []
    except Exception:
        current_ids = []
    dept_id_str = str(dept_id)
    if dept_id_str not in current_ids:
        current_ids.append(dept_id_str)
        current_user.allowed_dept_ids = json.dumps(current_ids)
        session.add(current_user)


def _with_user_count(dept: Department, session: Session) -> DepartmentRead:
    count = session.exec(
        select(func.count(User.id)).where(User.department_id == dept.id)
    ).one()
    return DepartmentRead(
        id=dept.id,
        name=dept.name,
        slug=dept.slug,
        is_active=dept.is_active,
        created_at=dept.created_at,
        user_count=count or 0,
    )


@router.get("/", response_model=List[DepartmentRead])
def list_departments(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List all departments. Any authenticated user may call this (needed for the dept selector UI)."""
    depts = session.exec(select(Department).order_by(Department.name)).all()
    return [_with_user_count(d, session) for d in depts]


@router.post("/", response_model=DepartmentRead, status_code=status.HTTP_201_CREATED)
def create_department(
    data: DepartmentCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new department. Superadmin or tech stack manager."""
    _require_dept_manage_role(current_user)

    slug = data.slug.strip().lower()
    existing = session.exec(
        select(Department).where(Department.slug == slug)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A department with this slug already exists")

    dept = Department(name=data.name.strip(), slug=slug)
    session.add(dept)
    _grant_dept_access(current_user, dept.id, session)
    session.commit()
    session.refresh(dept)
    return _with_user_count(dept, session)


@router.patch("/{dept_id}", response_model=DepartmentRead)
def update_department(
    dept_id: uuid.UUID,
    data: DepartmentUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update department name, slug, or active status. Superadmin, or tech stack
    manager for a department assigned to them."""
    _require_dept_manage_role(current_user)
    _assert_dept_in_scope(current_user, dept_id, session)

    dept = session.get(Department, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    for key, value in data.model_dump(exclude_unset=True).items():
        if key == "slug" and value:
            value = value.strip().lower()
        setattr(dept, key, value)

    session.add(dept)
    session.commit()
    session.refresh(dept)
    return _with_user_count(dept, session)


@router.delete("/{dept_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_department(
    dept_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a department (sets is_active=False). Superadmin, or tech stack
    manager for a department assigned to them."""
    _require_dept_manage_role(current_user)
    _assert_dept_in_scope(current_user, dept_id, session)

    dept = session.get(Department, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    dept.is_active = False
    session.add(dept)
    session.commit()

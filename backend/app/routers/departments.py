import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.models.department import Department
from app.models.user import User, UserRole
from app.schemas.department import DepartmentCreate, DepartmentRead, DepartmentUpdate

router = APIRouter(
    prefix="/api/v1/departments",
    tags=["Departments"],
    dependencies=[Depends(get_current_user)],
)


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
    """Create a new department. Superadmin only."""
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Only superadmins can manage departments")

    slug = data.slug.strip().lower()
    existing = session.exec(
        select(Department).where(Department.slug == slug)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A department with this slug already exists")

    dept = Department(name=data.name.strip(), slug=slug)
    session.add(dept)
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
    """Update department name, slug, or active status. Superadmin only."""
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Only superadmins can manage departments")

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
    """Soft-delete a department (sets is_active=False). Superadmin only."""
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Only superadmins can manage departments")

    dept = session.get(Department, dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    dept.is_active = False
    session.add(dept)
    session.commit()

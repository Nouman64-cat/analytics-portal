import json
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from app.deps import get_current_user, assert_write_access
from sqlmodel import Session, select
from app.database import get_session
from app.activity_log import record_activity
from app.models.business_developer import BusinessDeveloper
from app.models.user import User, UserRole
from app.dept_scope import get_user_allowed_depts
from app.schemas.business_developer import (
    BusinessDeveloperCreate,
    BusinessDeveloperRead,
    BusinessDeveloperUpdate,
)

router = APIRouter(prefix="/api/v1/business-developers", tags=["Business Developers"], dependencies=[Depends(get_current_user)])


def _bd_dept_ids(bd: BusinessDeveloper) -> list[str]:
    """Return the list of dept ID strings for a BD (empty list if none set)."""
    if bd.department_ids is None:
        return []
    try:
        return json.loads(bd.department_ids)
    except Exception:
        return []


def _allowed_dept_strs(user: User) -> list[str] | None:
    """Return lead's allowed dept IDs as strings, or None for unrestricted."""
    allowed = get_user_allowed_depts(user)
    if allowed is None:
        return None
    return [str(d) for d in allowed]


@router.get("/", response_model=list[BusinessDeveloperRead])
def list_business_developers(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List business developers, scoped to the caller's department(s) for BD_TEAM_LEAD and BD."""
    all_bds = session.exec(select(BusinessDeveloper).order_by(BusinessDeveloper.name)).all()

    if current_user.role in (UserRole.BD_TEAM_LEAD, UserRole.BD):
        allowed = _allowed_dept_strs(current_user)
        if allowed is not None:
            def visible(bd: BusinessDeveloper) -> bool:
                bd_depts = _bd_dept_ids(bd)
                if not bd_depts:
                    return True
                return any(d in allowed for d in bd_depts)
            all_bds = [b for b in all_bds if visible(b)]

    return all_bds


@router.post("/", response_model=BusinessDeveloperRead, status_code=status.HTTP_201_CREATED)
def create_business_developer(
    data: BusinessDeveloperCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new business developer."""
    assert_write_access(current_user)
    dept_ids = data.department_ids

    if current_user.role == UserRole.BD_TEAM_LEAD:
        allowed = _allowed_dept_strs(current_user)
        if allowed is not None:
            if not dept_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="BD team leads must assign at least one department",
                )
            for did in dept_ids:
                if did not in allowed:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Cannot assign departments outside your scope",
                    )

    dept_ids_json = json.dumps(dept_ids) if dept_ids is not None else None
    bd = BusinessDeveloper(name=data.name, email=data.email or None, department_ids=dept_ids_json)
    session.add(bd)
    session.flush()
    record_activity(
        session,
        actor=current_user,
        action="create_business_developer",
        entity_type="business_developer",
        entity_id=bd.id,
        message=f"Created business developer '{bd.name}'",
    )
    session.commit()
    session.refresh(bd)
    return bd


@router.put("/{bd_id}", response_model=BusinessDeveloperRead)
def update_business_developer(
    bd_id: uuid.UUID,
    data: BusinessDeveloperUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update a business developer."""
    assert_write_access(current_user)
    bd = session.get(BusinessDeveloper, bd_id)
    if not bd:
        raise HTTPException(status_code=404, detail="Business developer not found")

    if current_user.role == UserRole.BD_TEAM_LEAD:
        allowed = _allowed_dept_strs(current_user)
        if allowed is not None:
            existing_depts = _bd_dept_ids(bd)
            if not any(d in allowed for d in existing_depts) and existing_depts:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This BD is not in your department scope",
                )
            if data.department_ids is not None:
                for did in data.department_ids:
                    if did not in allowed:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot assign departments outside your scope",
                        )

    update_data = data.model_dump(exclude_unset=True)
    if "department_ids" in update_data:
        v = update_data.pop("department_ids")
        bd.department_ids = json.dumps(v) if v is not None else None
    for key, value in update_data.items():
        setattr(bd, key, value)
    bd.updated_at = datetime.utcnow()

    session.add(bd)
    session.commit()
    session.refresh(bd)
    record_activity(
        session,
        actor=current_user,
        action="update_business_developer",
        entity_type="business_developer",
        entity_id=bd.id,
        message=f"Updated business developer '{bd.name}'",
    )
    session.commit()
    return bd


@router.patch("/{bd_id}/status", response_model=BusinessDeveloperRead)
def toggle_business_developer_status(
    bd_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Toggle active/inactive status. Superadmin only."""
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Only superadmin can change BD status.")
    bd = session.get(BusinessDeveloper, bd_id)
    if not bd:
        raise HTTPException(status_code=404, detail="Business developer not found")
    bd.is_active = not bd.is_active
    bd.updated_at = datetime.utcnow()
    session.add(bd)
    session.commit()
    session.refresh(bd)
    record_activity(
        session,
        actor=current_user,
        action="update_business_developer",
        entity_type="business_developer",
        entity_id=bd.id,
        message=f"Set business developer '{bd.name}' to {'active' if bd.is_active else 'inactive'}",
    )
    session.commit()
    return bd


@router.delete("/{bd_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_business_developer(
    bd_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a business developer."""
    assert_write_access(current_user)
    bd = session.get(BusinessDeveloper, bd_id)
    if not bd:
        raise HTTPException(status_code=404, detail="Business developer not found")
    bd_name = bd.name
    session.delete(bd)
    record_activity(
        session,
        actor=current_user,
        action="delete_business_developer",
        entity_type="business_developer",
        entity_id=bd_id,
        message=f"Deleted business developer '{bd_name}'",
    )
    session.commit()

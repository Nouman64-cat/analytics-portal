import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from app.deps import get_current_user
from sqlmodel import Session, select
from app.database import get_session
from app.activity_log import record_activity
from app.models.business_developer import BusinessDeveloper
from app.models.user import User
from app.schemas.business_developer import (
    BusinessDeveloperCreate,
    BusinessDeveloperRead,
    BusinessDeveloperUpdate,
)

router = APIRouter(prefix="/api/v1/business-developers", tags=["Business Developers"], dependencies=[Depends(get_current_user)])


@router.get("/", response_model=list[BusinessDeveloperRead])
def list_business_developers(session: Session = Depends(get_session)):
    """List all business developers."""
    return session.exec(select(BusinessDeveloper).order_by(BusinessDeveloper.name)).all()


@router.post("/", response_model=BusinessDeveloperRead, status_code=status.HTTP_201_CREATED)
def create_business_developer(
    data: BusinessDeveloperCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new business developer."""
    bd = BusinessDeveloper(name=data.name)
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
):
    """Update a business developer."""
    bd = session.get(BusinessDeveloper, bd_id)
    if not bd:
        raise HTTPException(status_code=404, detail="Business developer not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(bd, key, value)
    bd.updated_at = datetime.utcnow()

    session.add(bd)
    session.commit()
    session.refresh(bd)
    return bd


@router.delete("/{bd_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_business_developer(bd_id: uuid.UUID, session: Session = Depends(get_session)):
    """Delete a business developer."""
    bd = session.get(BusinessDeveloper, bd_id)
    if not bd:
        raise HTTPException(status_code=404, detail="Business developer not found")
    session.delete(bd)
    session.commit()

import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from app.deps import get_current_user
from sqlmodel import Session, select
from app.database import get_session
from app.models.resume_profile import ResumeProfile
from app.schemas.resume_profile import (
    ResumeProfileCreate,
    ResumeProfileRead,
    ResumeProfileUpdate,
)

router = APIRouter(prefix="/api/v1/resume-profiles", tags=["Resume Profiles"], dependencies=[Depends(get_current_user)])


@router.get("/", response_model=list[ResumeProfileRead])
def list_resume_profiles(session: Session = Depends(get_session)):
    """List all resume profiles."""
    profiles = session.exec(select(ResumeProfile).order_by(ResumeProfile.name)).all()
    return profiles


@router.post("/", response_model=ResumeProfileRead, status_code=status.HTTP_201_CREATED)
def create_resume_profile(data: ResumeProfileCreate, session: Session = Depends(get_session)):
    """Create a new resume profile."""
    profile = ResumeProfile(name=data.name)
    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=ResumeProfileRead)
def get_resume_profile(profile_id: uuid.UUID, session: Session = Depends(get_session)):
    """Get a resume profile by ID."""
    profile = session.get(ResumeProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Resume profile not found")
    return profile


@router.put("/{profile_id}", response_model=ResumeProfileRead)
def update_resume_profile(
    profile_id: uuid.UUID,
    data: ResumeProfileUpdate,
    session: Session = Depends(get_session),
):
    """Update a resume profile."""
    profile = session.get(ResumeProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Resume profile not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(profile, key, value)
    profile.updated_at = datetime.utcnow()

    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resume_profile(profile_id: uuid.UUID, session: Session = Depends(get_session)):
    """Delete a resume profile."""
    profile = session.get(ResumeProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Resume profile not found")
    session.delete(profile)
    session.commit()

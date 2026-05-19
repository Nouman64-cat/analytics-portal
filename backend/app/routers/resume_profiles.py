import uuid
import os
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from botocore.exceptions import BotoCoreError, ClientError
from app.config import get_settings
from app.deps import get_current_user
from sqlmodel import Session, select
from app.database import get_session
from app.activity_log import record_activity
from app.dept_scope import apply_dept_filter, is_cross_dept
from app.models.candidate import Candidate
from app.models.department import Department
from app.models.resume_profile import ResumeProfile
from app.models.user import User, UserRole
from sqlalchemy import func
from app.schemas.resume_profile import (
    ResumeProfileCreate,
    ResumeProfileRead,
    ResumeProfileUpdate,
)

router = APIRouter(prefix="/api/v1/resume-profiles",
                   tags=["Resume Profiles"], dependencies=[Depends(get_current_user)])


def _get_s3_client(settings):
    try:
        import boto3
    except ImportError as e:
        raise HTTPException(
            status_code=500, detail="boto3 is required for S3 uploads") from e

    aws_access_key_id = settings.effective_aws_access_key_id
    aws_secret_access_key = settings.effective_aws_secret_access_key

    if not aws_access_key_id or not aws_secret_access_key:
        raise HTTPException(
            status_code=500, detail="AWS credentials are not configured")

    return boto3.client(
        "s3",
        region_name=settings.AWS_REGION,
        aws_access_key_id=aws_access_key_id,
        aws_secret_access_key=aws_secret_access_key,
    )


def _to_read(profile: ResumeProfile, dept: Optional[Department]) -> ResumeProfileRead:
    return ResumeProfileRead(
        id=profile.id,
        name=profile.name,
        is_active=profile.is_active,
        department_id=profile.department_id,
        department_name=dept.name if dept else None,
        linkedin_url=profile.linkedin_url,
        github_url=profile.github_url,
        portfolio_url=profile.portfolio_url,
        resume_url=profile.resume_url,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


def _effective_dept_for_user(
    session: Session,
    current_user: User,
    explicit_dept_id: Optional[uuid.UUID],
) -> Optional[uuid.UUID]:
    """
    Resolve which department to scope resume profiles to.

    Priority:
    1. Explicit ?department_id query param (for superadmin/manager dept selector)
    2. Team-member: the linked candidate's department (authoritative — user.department_id
       may be stale or mismatched; the candidate row is the source of truth)
    3. Any other user with a department_id: their own department
    4. None → caller decides (only superadmin falls through to unscoped)
    """
    if explicit_dept_id:
        return explicit_dept_id

    if current_user.role == UserRole.TEAM_MEMBER:
        cand = session.exec(
            select(Candidate).where(
                func.lower(Candidate.email) == current_user.email.lower()
            )
        ).first()
        if cand and cand.department_id:
            return cand.department_id
        # Linked candidate has no dept → fall back to user's own dept
        return current_user.department_id

    # Cross-dept roles (superadmin, manager, BD) see all when no explicit filter
    if is_cross_dept(current_user):
        return None

    return current_user.department_id


@router.get("/", response_model=list[ResumeProfileRead])
def list_resume_profiles(
    department_id: Optional[uuid.UUID] = Query(None, description="Filter by department"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List resume profiles scoped by department.

    Scoping rules:
    - Explicit ?department_id always takes priority (used by header dept selector).
    - Team-members: scoped to their linked candidate's department (not user.department_id
      which may be stale).
    - All other roles with a department: scoped to that department.
    - Only a global superadmin (no department assigned) sees profiles from all depts.
    """
    effective_dept = _effective_dept_for_user(session, current_user, department_id)

    query = (
        select(ResumeProfile, Department)
        .join(Department, ResumeProfile.department_id == Department.id, isouter=True)
        .order_by(ResumeProfile.name)
    )
    if effective_dept:
        query = query.where(ResumeProfile.department_id == effective_dept)
    elif not is_cross_dept(current_user):
        return []

    rows = session.exec(query).all()
    return [_to_read(p, d) for p, d in rows]


@router.post("/", response_model=ResumeProfileRead, status_code=status.HTTP_201_CREATED)
def create_resume_profile(
    data: ResumeProfileCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new resume profile stamped with the creator's department."""
    dept_id = data.department_id or current_user.department_id
    profile = ResumeProfile(name=data.name, department_id=dept_id)
    session.add(profile)
    session.flush()
    record_activity(
        session,
        actor=current_user,
        action="create_resume_profile",
        entity_type="resume_profile",
        entity_id=profile.id,
        message=f"Created resume profile '{profile.name}'",
    )
    session.commit()
    session.refresh(profile)
    dept = session.get(Department, profile.department_id) if profile.department_id else None
    return _to_read(profile, dept)


@router.get("/{profile_id}", response_model=ResumeProfileRead)
def get_resume_profile(profile_id: uuid.UUID, session: Session = Depends(get_session)):
    """Get a resume profile by ID."""
    profile = session.get(ResumeProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Resume profile not found")
    dept = session.get(Department, profile.department_id) if profile.department_id else None
    return _to_read(profile, dept)


@router.post("/{profile_id}/resume", response_model=ResumeProfileRead)
def upload_resume_pdf(
    profile_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
):
    """Upload a PDF resume to S3 and attach URL to the resume profile."""
    profile = session.get(ResumeProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Resume profile not found")

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400, detail="Only PDF files are accepted")

    try:
        file.file.seek(0, os.SEEK_END)
        upload_size = file.file.tell()
        file.file.seek(0)
    except Exception:
        upload_size = None

    if upload_size is not None and upload_size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File is too large (limit {settings.MAX_UPLOAD_SIZE // (1024*1024)}MB)",
        )

    s3_client = _get_s3_client(settings)
    key = f"resume_profiles/{profile_id}/resume-{uuid.uuid4()}.pdf"

    try:
        file.file.seek(0)
        s3_client.upload_fileobj(
            file.file,
            settings.AWS_S3_BUCKET_NAME,
            key,
            ExtraArgs={"ContentType": "application/pdf", "ACL": "private"},
        )
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {e}")

    profile.resume_url = f"https://{settings.AWS_S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
    profile.updated_at = datetime.utcnow()

    session.add(profile)
    session.commit()
    session.refresh(profile)
    dept = session.get(Department, profile.department_id) if profile.department_id else None
    return _to_read(profile, dept)


@router.put("/{profile_id}", response_model=ResumeProfileRead)
def update_resume_profile(
    profile_id: uuid.UUID,
    data: ResumeProfileUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
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
    record_activity(
        session,
        actor=current_user,
        action="update_resume_profile",
        entity_type="resume_profile",
        entity_id=profile.id,
        message=f"Updated resume profile '{profile.name}'",
    )
    session.commit()
    dept = session.get(Department, profile.department_id) if profile.department_id else None
    return _to_read(profile, dept)


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resume_profile(
    profile_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a resume profile."""
    profile = session.get(ResumeProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Resume profile not found")
    profile_name = profile.name
    session.delete(profile)
    record_activity(
        session,
        actor=current_user,
        action="delete_resume_profile",
        entity_type="resume_profile",
        entity_id=profile_id,
        message=f"Deleted resume profile '{profile_name}'",
    )
    session.commit()

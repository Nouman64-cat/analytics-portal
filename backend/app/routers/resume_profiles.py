import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from botocore.exceptions import BotoCoreError, ClientError
from app.config import get_settings
from app.deps import get_current_user
from sqlmodel import Session, select
from app.database import get_session
from app.models.resume_profile import ResumeProfile
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


@router.get("/", response_model=list[ResumeProfileRead])
def list_resume_profiles(session: Session = Depends(get_session)):
    """List all resume profiles."""
    profiles = session.exec(
        select(ResumeProfile).order_by(ResumeProfile.name)).all()
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

    # Construct URL to object (assuming standard AWS endpoint)
    profile.resume_url = f"https://{settings.AWS_S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
    profile.updated_at = datetime.utcnow()

    session.add(profile)
    session.commit()
    session.refresh(profile)

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

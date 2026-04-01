import uuid
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from botocore.exceptions import BotoCoreError, ClientError
from app.config import get_settings
from app.deps import get_current_user
from sqlmodel import Session, select, col
from sqlalchemy.orm import joinedload
from app.database import get_session
from app.models.interview import Interview
from app.models.company import Company
from app.models.candidate import Candidate
from app.models.resume_profile import ResumeProfile
from app.models.business_developer import BusinessDeveloper
from app.schemas.interview import (
    InterviewCreate,
    InterviewRead,
    InterviewUpdate,
    InterviewReadWithDetails,
)
from app.status_utils import compute_status

router = APIRouter(prefix="/api/v1/interviews",
                   tags=["Interviews"], dependencies=[Depends(get_current_user)])


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


def _enrich_interview(interview: Interview) -> dict:
    """Add human-readable names from relationships."""
    data = {
        "id": interview.id,
        "company_id": interview.company_id,
        "candidate_id": interview.candidate_id,
        "resume_profile_id": interview.resume_profile_id,
        "role": interview.role,
        "salary_range": interview.salary_range,
        "round": interview.round,
        "interview_date": interview.interview_date,
        "time_est": interview.time_est,
        "time_pkt": interview.time_pkt,
        "status": interview.status,
        "feedback": interview.feedback,
        "bd_id": interview.bd_id,
        "interviewer": interview.interviewer,
        "interview_link": interview.interview_link,
        "interview_doc_url": interview.interview_doc_url,
        "is_phone_call": interview.is_phone_call,
        "computed_status": compute_status(interview.status, interview.interview_date),
        "created_at": interview.created_at,
        "updated_at": interview.updated_at,
        "company_name": interview.company.name if interview.company else None,
        "candidate_name": interview.candidate.name if interview.candidate else None,
        "resume_profile_name": interview.resume_profile.name if interview.resume_profile else None,
        "bd_name": interview.business_developer.name if interview.business_developer else None,
    }
    return data


@router.get("/", response_model=list[InterviewReadWithDetails])
def list_interviews(
    candidate_id: Optional[uuid.UUID] = Query(
        None, description="Filter by candidate"),
    company_id: Optional[uuid.UUID] = Query(
        None, description="Filter by company"),
    resume_profile_id: Optional[uuid.UUID] = Query(
        None, description="Filter by resume profile"),
    status_filter: Optional[str] = Query(
        None, alias="status", description="Filter by status (partial match)"),
    date_from: Optional[date] = Query(
        None, description="Filter interviews from this date"),
    date_to: Optional[date] = Query(
        None, description="Filter interviews up to this date"),
    session: Session = Depends(get_session),
):
    """List interviews with optional filters."""
    query = select(Interview).options(
        joinedload(Interview.company),
        joinedload(Interview.candidate),
        joinedload(Interview.resume_profile),
        joinedload(Interview.business_developer),
    )

    if candidate_id:
        query = query.where(Interview.candidate_id == candidate_id)
    if company_id:
        query = query.where(Interview.company_id == company_id)
    if resume_profile_id:
        query = query.where(Interview.resume_profile_id == resume_profile_id)
    if status_filter:
        query = query.where(col(Interview.status).icontains(status_filter))
    if date_from:
        query = query.where(Interview.interview_date >= date_from)
    if date_to:
        query = query.where(Interview.interview_date <= date_to)

    query = query.order_by(Interview.interview_date.desc())  # type: ignore
    interviews = session.exec(query).all()

    return [_enrich_interview(i) for i in interviews]


@router.post("/", response_model=InterviewReadWithDetails, status_code=status.HTTP_201_CREATED)
def create_interview(data: InterviewCreate, session: Session = Depends(get_session)):
    """Create a new interview record."""
    # Validate foreign keys exist
    if not session.get(Company, data.company_id):
        raise HTTPException(status_code=404, detail="Company not found")
    if not session.get(Candidate, data.candidate_id):
        raise HTTPException(status_code=404, detail="Candidate not found")
    if not session.get(ResumeProfile, data.resume_profile_id):
        raise HTTPException(status_code=404, detail="Resume profile not found")
    if data.bd_id and not session.get(BusinessDeveloper, data.bd_id):
        raise HTTPException(
            status_code=404, detail="Business developer not found")

    interview = Interview(**data.model_dump())
    session.add(interview)
    session.commit()
    session.refresh(interview)
    return _enrich_interview(interview)


@router.get("/{interview_id}", response_model=InterviewReadWithDetails)
def get_interview(interview_id: uuid.UUID, session: Session = Depends(get_session)):
    """Get an interview by ID with full details."""
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return _enrich_interview(interview)


@router.post("/{interview_id}/document", response_model=InterviewReadWithDetails)
def upload_interview_document(
    interview_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
):
    """Upload interview detail document (Word DOC or DOCX) to S3."""
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    allowed_types = {
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    }
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400, detail="Only DOC and DOCX files are allowed")

    extension = allowed_types[file.content_type]
    key = f"interview_docs/{interview_id}/interview_doc-{uuid.uuid4()}.{extension}"
    s3_client = _get_s3_client(settings)

    if not settings.AWS_S3_BUCKET_NAME:
        raise HTTPException(
            status_code=500, detail="AWS S3 bucket not configured")

    try:
        file.file.seek(0)
        s3_client.upload_fileobj(
            file.file,
            settings.AWS_S3_BUCKET_NAME,
            key,
            ExtraArgs={"ContentType": file.content_type, "ACL": "private"},
        )
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {e}")

    interview.interview_doc_url = f"https://{settings.AWS_S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
    interview.updated_at = datetime.utcnow()
    session.add(interview)
    session.commit()
    session.refresh(interview)

    return _enrich_interview(interview)


@router.put("/{interview_id}", response_model=InterviewReadWithDetails)
def update_interview(
    interview_id: uuid.UUID,
    data: InterviewUpdate,
    session: Session = Depends(get_session),
):
    """Update an interview record."""
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    update_data = data.model_dump(exclude_unset=True)

    # Validate FK updates if provided
    if "company_id" in update_data and not session.get(Company, update_data["company_id"]):
        raise HTTPException(status_code=404, detail="Company not found")
    if "candidate_id" in update_data and not session.get(Candidate, update_data["candidate_id"]):
        raise HTTPException(status_code=404, detail="Candidate not found")
    if "resume_profile_id" in update_data and not session.get(ResumeProfile, update_data["resume_profile_id"]):
        raise HTTPException(status_code=404, detail="Resume profile not found")
    if "bd_id" in update_data and update_data["bd_id"] and not session.get(BusinessDeveloper, update_data["bd_id"]):
        raise HTTPException(
            status_code=404, detail="Business developer not found")

    for key, value in update_data.items():
        setattr(interview, key, value)
    interview.updated_at = datetime.utcnow()

    session.add(interview)
    session.commit()
    session.refresh(interview)
    return _enrich_interview(interview)


@router.delete("/{interview_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_interview(interview_id: uuid.UUID, session: Session = Depends(get_session)):
    """Delete an interview record."""
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    session.delete(interview)
    session.commit()

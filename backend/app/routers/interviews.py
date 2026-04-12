import uuid
import os
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from botocore.exceptions import BotoCoreError, ClientError
from app.config import get_settings
from app.deps import get_current_user
from sqlmodel import Session, select, col
from sqlalchemy.orm import joinedload, selectinload
from app.database import get_session
from app.activity_log import record_activity
from app.models.interview import Interview
from app.models.company import Company
from app.models.candidate import Candidate
from app.models.resume_profile import ResumeProfile
from app.models.business_developer import BusinessDeveloper
from app.models.interview_reminder_log import InterviewReminderLog
from app.models.user import User, UserRole
from app.team_member_scope import (
    apply_team_member_interview_list_filter,
    candidate_id_for_team_member,
    team_member_can_access_thread,
    team_member_can_read_interview,
    team_member_must_own_interview,
)
from app.schemas.interview import (
    InterviewCreate,
    InterviewRead,
    InterviewUpdate,
    InterviewReadWithDetails,
)
from app.status_utils import compute_status
from app.email_ses import try_send_interview_created_email

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
        "thread_id": interview.thread_id,
        "parent_interview_id": interview.parent_interview_id,
        "role": interview.role,
        "salary_range": interview.salary_range,
        "round": interview.round,
        "interview_date": interview.interview_date,
        "time_est": interview.time_est,
        "time_pkt": interview.time_pkt,
        "status": interview.status,
        "feedback": interview.feedback,
        "recruiter_feedback": interview.recruiter_feedback,
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


def _enrich_interview_for_reader(
    session: Session, interview: Interview, current_user: User
) -> dict:
    """Full fields for the interview's candidate owner; pipeline-only summary for other team members."""
    data = _enrich_interview(interview)
    if current_user.role != UserRole.TEAM_MEMBER:
        return data
    cid = candidate_id_for_team_member(session, current_user)
    if cid is None or interview.candidate_id == cid:
        return data
    data["feedback"] = None
    data["recruiter_feedback"] = None
    data["interview_doc_url"] = None
    data["interview_link"] = None
    data["salary_range"] = None
    return data


def _pipeline_step_total_map(
    session: Session, thread_ids: set[uuid.UUID]
) -> dict[uuid.UUID, tuple[int, int]]:
    """Map interview id -> (1-based step, total rounds) in thread order (all candidates)."""
    out: dict[uuid.UUID, tuple[int, int]] = {}
    if not thread_ids:
        return out
    rows = session.exec(
        select(Interview).where(Interview.thread_id.in_(thread_ids))
    ).all()
    by_thread: dict[uuid.UUID, list[Interview]] = {}
    for r in rows:
        by_thread.setdefault(r.thread_id, []).append(r)
    for arr in by_thread.values():
        ordered = sorted(
            arr,
            key=lambda x: (x.interview_date or date.max, x.created_at),
        )
        n = len(ordered)
        for i, r in enumerate(ordered):
            out[r.id] = (i + 1, n)
    return out


def _attach_pipeline_meta(
    data: dict,
    interview_id: uuid.UUID,
    pipe_map: dict[uuid.UUID, tuple[int, int]],
) -> dict:
    if interview_id in pipe_map:
        step, total = pipe_map[interview_id]
        data["pipeline_thread_step"] = step
        data["pipeline_thread_total"] = total
    return data


def _finalize_interview_response(
    session: Session, interview: Interview, current_user: User
) -> dict:
    tids = {interview.thread_id} if interview.thread_id else set()
    pipe_map = _pipeline_step_total_map(session, tids)
    data = _enrich_interview_for_reader(session, interview, current_user)
    return _attach_pipeline_meta(data, interview.id, pipe_map)


def _get_interview_for_enrichment(
    session: Session, interview_id: uuid.UUID
) -> Optional[Interview]:
    """Load interview with relationships so _enrich_interview does not N+1 query."""
    stmt = (
        select(Interview)
        .where(Interview.id == interview_id)
        .options(
            selectinload(Interview.company),
            selectinload(Interview.candidate),
            selectinload(Interview.resume_profile),
            selectinload(Interview.business_developer),
        )
    )
    return session.exec(stmt).first()


def _collect_descendant_ids(session: Session, root_id: uuid.UUID) -> set[uuid.UUID]:
    """All interviews that list root_id as an ancestor (follow child links)."""
    out: set[uuid.UUID] = set()
    stack = [root_id]
    while stack:
        nid = stack.pop()
        children = session.exec(
            select(Interview).where(Interview.parent_interview_id == nid)
        ).all()
        for ch in children:
            if ch.id not in out:
                out.add(ch.id)
                stack.append(ch.id)
    return out


def _propagate_thread_id(
    session: Session, root_id: uuid.UUID, new_thread_id: uuid.UUID
) -> None:
    """Set thread_id on root_id and every descendant (via parent_interview_id children)."""
    stack = [root_id]
    seen: set[uuid.UUID] = set()
    while stack:
        nid = stack.pop()
        if nid in seen:
            continue
        seen.add(nid)
        row = session.get(Interview, nid)
        if not row:
            continue
        row.thread_id = new_thread_id
        session.add(row)
        children = session.exec(
            select(Interview).where(Interview.parent_interview_id == nid)
        ).all()
        for ch in children:
            stack.append(ch.id)


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
    current_user: User = Depends(get_current_user),
):
    """List interviews with optional filters. Team members only see their candidate's rows; pipeline step/total reflects the full thread."""
    query = select(Interview).options(
        joinedload(Interview.company),
        joinedload(Interview.candidate),
        joinedload(Interview.resume_profile),
        joinedload(Interview.business_developer),
    )

    query = apply_team_member_interview_list_filter(session, current_user, query)

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

    thread_ids = {i.thread_id for i in interviews if i.thread_id}
    pipe_map = _pipeline_step_total_map(session, thread_ids)
    return [
        _attach_pipeline_meta(
            _enrich_interview_for_reader(session, i, current_user),
            i.id,
            pipe_map,
        )
        for i in interviews
    ]


@router.get("/thread/{thread_id}", response_model=list[InterviewReadWithDetails])
def list_interviews_by_thread(
    thread_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """All rounds in one thread. Team members see full chain for pipeline UI; non-owned rows omit sensitive fields."""
    if current_user.role == UserRole.TEAM_MEMBER and not team_member_can_access_thread(
        session, current_user, thread_id
    ):
        raise HTTPException(status_code=404, detail="Interview not found")
    query = (
        select(Interview)
        .where(Interview.thread_id == thread_id)
        .options(
            joinedload(Interview.company),
            joinedload(Interview.candidate),
            joinedload(Interview.resume_profile),
            joinedload(Interview.business_developer),
        )
    )
    rows = session.exec(query).all()
    by_id: dict[uuid.UUID, Interview] = {}
    for row in rows:
        by_id[row.id] = row
    ordered = sorted(
        by_id.values(),
        key=lambda x: (x.interview_date or date.max, x.created_at),
    )
    pipe_map = _pipeline_step_total_map(session, {thread_id})
    return [
        _attach_pipeline_meta(
            _enrich_interview_for_reader(session, i, current_user),
            i.id,
            pipe_map,
        )
        for i in ordered
    ]


@router.post("/", response_model=InterviewReadWithDetails, status_code=status.HTTP_201_CREATED)
def create_interview(
    data: InterviewCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new interview record."""
    payload = data.model_dump()
    tm_cid = candidate_id_for_team_member(session, current_user)
    if current_user.role == UserRole.TEAM_MEMBER:
        if tm_cid is None:
            raise HTTPException(
                status_code=400,
                detail="No candidate record matches your login email. Ask an admin to add a candidate with the same email as your user account.",
            )
        payload["candidate_id"] = tm_cid

    # Validate foreign keys exist
    if not session.get(Company, payload["company_id"]):
        raise HTTPException(status_code=404, detail="Company not found")
    if not session.get(Candidate, payload["candidate_id"]):
        raise HTTPException(status_code=404, detail="Candidate not found")
    if not session.get(ResumeProfile, payload["resume_profile_id"]):
        raise HTTPException(status_code=404, detail="Resume profile not found")
    if payload.get("bd_id") and not session.get(BusinessDeveloper, payload["bd_id"]):
        raise HTTPException(
            status_code=404, detail="Business developer not found")

    parent_id = payload.pop("parent_interview_id", None)
    explicit_thread = payload.pop("thread_id", None)

    parent_for_followup: Optional[Interview] = None
    if parent_id:
        parent_for_followup = session.get(Interview, parent_id)
        if not parent_for_followup:
            raise HTTPException(
                status_code=404, detail="Parent interview not found")
        if payload["company_id"] != parent_for_followup.company_id:
            raise HTTPException(
                status_code=400,
                detail="company_id must match the parent interview when adding a follow-up round",
            )
        if (
            current_user.role == UserRole.TEAM_MEMBER
            and tm_cid is not None
            and parent_for_followup.candidate_id != tm_cid
        ):
            raise HTTPException(
                status_code=400,
                detail="Parent interview is not part of your candidate pipeline.",
            )
        payload["thread_id"] = parent_for_followup.thread_id
        payload["parent_interview_id"] = parent_id
    else:
        payload["parent_interview_id"] = None
        payload["thread_id"] = explicit_thread or uuid.uuid4()

    interview = Interview(**payload)
    session.add(interview)
    if parent_for_followup:
        parent_for_followup.status = "Converted"
        parent_for_followup.updated_at = datetime.utcnow()
        session.add(parent_for_followup)
    session.commit()
    loaded = _get_interview_for_enrichment(session, interview.id)
    if not loaded:
        raise HTTPException(status_code=500, detail="Interview reload failed")

    record_activity(
        session,
        actor=current_user,
        action="create_interview",
        entity_type="interview",
        entity_id=loaded.id,
        message=f"Created interview '{loaded.role}' at '{loaded.company.name if loaded.company else 'Unknown company'}'",
    )
    session.commit()

    cand = loaded.candidate
    try_send_interview_created_email(
        get_settings(),
        to_email=cand.email if cand else None,
        candidate_name=cand.name if cand else "Candidate",
        company_name=loaded.company.name if loaded.company else "",
        role=loaded.role,
        round_name=loaded.round,
        interview_date=loaded.interview_date,
        time_est=loaded.time_est,
        time_pkt=loaded.time_pkt,
        interviewer=loaded.interviewer,
        interview_link=loaded.interview_link,
        is_phone_call=loaded.is_phone_call,
    )

    return _finalize_interview_response(session, loaded, current_user)


@router.get("/{interview_id}", response_model=InterviewReadWithDetails)
def get_interview(
    interview_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get an interview by ID with full details."""
    interview = _get_interview_for_enrichment(session, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    if not team_member_can_read_interview(session, current_user, interview):
        raise HTTPException(status_code=404, detail="Interview not found")
    return _finalize_interview_response(session, interview, current_user)


@router.post("/{interview_id}/document", response_model=InterviewReadWithDetails)
def upload_interview_document(
    interview_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    current_user: User = Depends(get_current_user),
):
    """Upload interview detail document (Word DOC or DOCX) to S3."""
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    team_member_must_own_interview(session, current_user, interview)

    # Enforce a maximum upload size on server side
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

    allowed_types = {
        "application/msword": "doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/pdf": "pdf",
    }
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only DOC, DOCX, and PDF files are allowed",
        )

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
    loaded = _get_interview_for_enrichment(session, interview_id)
    if not loaded:
        raise HTTPException(status_code=500, detail="Interview reload failed")

    return _finalize_interview_response(session, loaded, current_user)


@router.put("/{interview_id}", response_model=InterviewReadWithDetails)
def update_interview(
    interview_id: uuid.UUID,
    data: InterviewUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update an interview record."""
    interview = _get_interview_for_enrichment(session, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    team_member_must_own_interview(session, current_user, interview)

    update_data = data.model_dump(exclude_unset=True)
    if current_user.role == UserRole.TEAM_MEMBER:
        update_data.pop("candidate_id", None)
    # Thread is derived from the parent chain; clients should not set it directly.
    update_data.pop("thread_id", None)

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

    if "parent_interview_id" in update_data:
        new_parent = update_data["parent_interview_id"]
        tgt_company = update_data.get("company_id", interview.company_id)
        if new_parent is None:
            _propagate_thread_id(session, interview_id, uuid.uuid4())
        else:
            par = session.get(Interview, new_parent)
            if not par:
                raise HTTPException(status_code=404, detail="Parent interview not found")
            if par.company_id != tgt_company:
                raise HTTPException(
                    status_code=400,
                    detail="Parent interview must be for the same company",
                )
            tm_cid = candidate_id_for_team_member(session, current_user)
            if (
                current_user.role == UserRole.TEAM_MEMBER
                and tm_cid is not None
                and par.candidate_id != tm_cid
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Parent interview is not part of your candidate pipeline.",
                )
            descendants = _collect_descendant_ids(session, interview_id)
            if new_parent == interview_id or new_parent in descendants:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid parent interview (would create a cycle)",
                )
            _propagate_thread_id(session, interview_id, par.thread_id)

    for key, value in update_data.items():
        setattr(interview, key, value)
    interview.updated_at = datetime.utcnow()

    session.add(interview)
    session.commit()
    loaded = _get_interview_for_enrichment(session, interview_id)
    if not loaded:
        raise HTTPException(status_code=404, detail="Interview not found")
    record_activity(
        session,
        actor=current_user,
        action="update_interview",
        entity_type="interview",
        entity_id=loaded.id,
        message=f"Updated interview '{loaded.role}' at '{loaded.company.name if loaded.company else 'Unknown company'}'",
    )
    session.commit()
    return _finalize_interview_response(session, loaded, current_user)


@router.delete("/{interview_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_interview(
    interview_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete an interview record."""
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    team_member_must_own_interview(session, current_user, interview)

    # Remove dependent reminder logs first to avoid FK violations.
    reminder_logs = session.exec(
        select(InterviewReminderLog).where(
            InterviewReminderLog.interview_id == interview_id
        )
    ).all()
    for row in reminder_logs:
        session.delete(row)

    role_label = interview.role
    company_label = interview.company.name if interview.company else "Unknown company"
    session.delete(interview)
    record_activity(
        session,
        actor=current_user,
        action="delete_interview",
        entity_type="interview",
        entity_id=interview_id,
        message=f"Deleted interview '{role_label}' at '{company_label}'",
    )
    session.commit()

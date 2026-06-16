import uuid
import os
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from botocore.exceptions import BotoCoreError, ClientError
from app.config import get_settings
from app.deps import get_current_user, assert_write_access
from sqlmodel import Session, select, col, or_, and_, func
from sqlalchemy import false as sql_false, nulls_last
from sqlalchemy.orm import joinedload, selectinload
from app.database import get_session
from app.dept_scope import apply_dept_filter, get_user_allowed_depts
from app.activity_log import record_activity
from app.models.interview import Interview
from app.models.company import Company
from app.models.candidate import Candidate
from app.models.resume_profile import ResumeProfile
from app.models.business_developer import BusinessDeveloper
from app.models.interview_reminder_log import InterviewReminderLog
from app.models.lead_thread import LeadThread
from app.models.user import User, UserRole
from app.lead_thread_utils import (
    ALLOWED_LEAD_OUTCOMES,
    ensure_lead_thread,
    effective_lead_fields,
    load_lead_map,
)
from app.team_member_scope import (
    apply_team_member_interview_list_filter,
    candidate_id_for_team_member,
    team_member_can_access_thread,
    team_member_can_read_interview,
    team_member_must_own_interview,
)
from app.bd_scope import get_bd_entity_scope, assert_bd_lead_write_access, other_bd_user_ids_select, is_superadmin_linked_bd
from app.schemas.interview import (
    InterviewCreate,
    InterviewRead,
    InterviewUpdate,
    InterviewReadWithDetails,
)
from app.schemas.lead_thread import LeadThreadRead, LeadThreadUpdate
from app.status_utils import (
    LEAD_ONLY_INTERVIEW_STATUSES,
    computed_status_for_interview_display,
    compute_status,
)
from app.email_ses import try_send_interview_created_email, make_presigned_doc_url

router = APIRouter(prefix="/api/v1/interviews",
                   tags=["Interviews"], dependencies=[Depends(get_current_user)])


_s3_client_cache: dict = {}


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

    cache_key = (aws_access_key_id, settings.AWS_REGION)
    if cache_key not in _s3_client_cache:
        _s3_client_cache[cache_key] = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
        )
    return _s3_client_cache[cache_key]


def _thread_primary_bd_id(session: Session, thread_id: uuid.UUID) -> Optional[uuid.UUID]:
    """Return the bd_id from the earliest interview in this thread that has one set."""
    rows = session.exec(
        select(Interview).where(Interview.thread_id == thread_id).order_by(
            Interview.interview_date, Interview.created_at)
    ).all()
    for r in rows:
        if r.bd_id:
            return r.bd_id
    return None


def _reject_lead_only_interview_status(status: Optional[str]) -> None:
    if status and status.strip().lower() in LEAD_ONLY_INTERVIEW_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Dropped, closed, and dead are pipeline (lead) outcomes. Set them on the lead, not on this round's status field. Use Rejected on the round when that interview was a no.",
        )


def _enrich_interview(interview: Interview, bd_dept_only: bool = False) -> dict:
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
        "resume_url": interview.resume_url,
        "is_phone_call": interview.is_phone_call,
        "computed_status": computed_status_for_interview_display(
            interview.status, interview.interview_date, interview.created_at
        ),
        "created_at": interview.created_at,
        "updated_at": interview.updated_at,
        "company_name": interview.company.name if interview.company else None,
        "candidate_name": interview.candidate.name if interview.candidate else None,
        "resume_profile_name": interview.resume_profile.name if interview.resume_profile else None,
        "bd_name": interview.business_developer.name if interview.business_developer else None,
        "bd_dept_only": bd_dept_only,
    }
    return data


def _enrich_interview_for_reader(
    session: Session, interview: Interview, current_user: User, bd_dept_only: bool = False
) -> dict:
    """Full fields for the interview's candidate owner; pipeline-only summary for other team members.
    When bd_dept_only=True the row is visible but sensitive fields are scrubbed.
    """
    data = _enrich_interview(interview, bd_dept_only=bd_dept_only)
    if bd_dept_only:
        # BD can see the row exists but not sensitive details
        data["feedback"] = None
        data["recruiter_feedback"] = None
        data["interview_doc_url"] = None
        data["resume_url"] = None
        data["interview_link"] = None
        data["salary_range"] = None
        return data
    if current_user.role != UserRole.TEAM_MEMBER:
        return data
    cid = candidate_id_for_team_member(session, current_user)
    if cid is None or interview.candidate_id == cid:
        return data
    data["feedback"] = None
    data["recruiter_feedback"] = None
    data["interview_doc_url"] = None
    data["resume_url"] = None
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


def _merge_lead_fields(
    session: Session,
    data: dict,
    thread_id: uuid.UUID,
    lead_map: dict[uuid.UUID, LeadThread],
) -> dict:
    lt = lead_map.get(thread_id)
    eff = effective_lead_fields(session, thread_id, lt)
    data.update(eff)
    return data


def _finalize_interview_response(
    session: Session, interview: Interview, current_user: User, bd_dept_only: bool = False
) -> dict:
    tids = {interview.thread_id} if interview.thread_id else set()
    pipe_map = _pipeline_step_total_map(session, tids)
    lead_map = load_lead_map(session, tids)
    data = _enrich_interview_for_reader(session, interview, current_user, bd_dept_only=bd_dept_only)
    data = _attach_pipeline_meta(data, interview.id, pipe_map)
    return _merge_lead_fields(session, data, interview.thread_id, lead_map)


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
    search: Optional[str] = Query(
        None,
        description="Search interviews by company, role, candidate, profile, status, or notes",
    ),
    date_from: Optional[date] = Query(
        None, description="Filter interviews from this date"),
    date_to: Optional[date] = Query(
        None, description="Filter interviews up to this date"),
    department_id: Optional[uuid.UUID] = Query(
        None, description="Filter by department (cross-dept roles only)"),
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

    query = apply_team_member_interview_list_filter(
        session, current_user, query)
    # For multi-dept team members: respect the department_id filter even on their own interviews
    if current_user.role == UserRole.TEAM_MEMBER and department_id:
        query = query.where(Interview.department_id == department_id)
    elif current_user.role != UserRole.TEAM_MEMBER:
        if current_user.role == UserRole.BD and is_superadmin_linked_bd(current_user, session):
            # Superadmin-linked BD: full cross-dept read access, no entity scope restriction
            query = apply_dept_filter(query, Interview, current_user, department_id, session)
        elif current_user.role in (UserRole.BD_TEAM_LEAD, UserRole.BD):
            scope = get_bd_entity_scope(current_user, session)

            if current_user.role == UserRole.BD:
                # Regular BD: only see interviews they personally created, OR interviews
                # attributed to their BD entity that were NOT created by another BD user
                # who also links to that same entity (prevents cross-member leakage).
                # This handles the case where a superadmin creates an interview and sets
                # bd_id to this BD's entity — that row should still be visible to the BD.
                conds: list = [Interview.created_by_user_id == current_user.id]
                if scope:  # bd_entity_id is linked
                    # Subquery: every OTHER BD-type user (keyed on role, not on the
                    # bd_entity_id column, so siblings resolved via fallback are caught).
                    other_bd_user_ids = other_bd_user_ids_select(current_user)
                    # Include bd_id matches only if NOT created by another BD user
                    # (i.e. only rows an admin attributed to this BD's entity).
                    conds.append(
                        and_(
                            Interview.bd_id.in_(scope),
                            Interview.created_by_user_id.not_in(other_bd_user_ids),
                        )
                    )

            else:  # BD_TEAM_LEAD
                conds = [Interview.created_by_user_id == current_user.id]

                if scope is None:
                    # Backward compat: bd_entity_id not linked — match by email/name to BD entity only
                    bd = session.exec(
                        select(BusinessDeveloper).where(func.lower(
                            BusinessDeveloper.email) == current_user.email.lower())
                    ).first()
                    if not bd:
                        bd = session.exec(
                            select(BusinessDeveloper).where(
                                or_(
                                    func.lower(
                                        BusinessDeveloper.name) == current_user.full_name.lower(),
                                    func.lower(current_user.full_name).contains(
                                        func.lower(BusinessDeveloper.name)),
                                    func.lower(BusinessDeveloper.name).contains(
                                        func.lower(current_user.full_name))
                                )
                            )
                        ).first()
                    if bd:
                        conds.append(Interview.bd_id == bd.id)
                else:
                    # BD_TEAM_LEAD scope = own entity + all team member entities
                    conds.append(Interview.bd_id.in_(scope))

                # Always include interviews created by direct team members.
                team_user_ids_query = select(User.id).where(
                    User.team_lead_user_id == current_user.id)
                conds.append(Interview.created_by_user_id.in_(
                    team_user_ids_query))

            # NOTE: BD / BD_TEAM_LEAD visibility is strictly ownership/hierarchy based.
            # We intentionally do NOT OR-in department-wide rows here: a regular BD must
            # see only what they created (plus admin-attributed entity rows), and a team
            # lead only their own + direct team members'. Pulling in the whole department
            # leaked sibling BDs' leads/interviews to each other.
            if department_id:
                query = query.where(Interview.department_id == department_id)

            query = query.where(or_(*conds))
        else:
            query = apply_dept_filter(
                query, Interview, current_user, department_id)

    if candidate_id:
        query = query.where(Interview.candidate_id == candidate_id)
    if company_id:
        query = query.where(Interview.company_id == company_id)
    if resume_profile_id:
        query = query.where(Interview.resume_profile_id == resume_profile_id)
    if status_filter:
        query = query.where(col(Interview.status).icontains(status_filter))
    if search:
        search_q = search.lower()
        query = query.join(Interview.company, isouter=True)
        query = query.join(Interview.candidate, isouter=True)
        query = query.join(Interview.resume_profile, isouter=True)
        query = query.where(
            or_(
                func.lower(Interview.role).contains(search_q),
                func.lower(Interview.status).contains(search_q),
                func.lower(Interview.interviewer).contains(search_q),
                func.lower(Interview.feedback).contains(search_q),
                func.lower(Interview.recruiter_feedback).contains(search_q),
                func.lower(Company.name).contains(search_q),
                func.lower(Candidate.name).contains(search_q),
                func.lower(ResumeProfile.name).contains(search_q),
            )
        )
    if date_from:
        query = query.where(Interview.interview_date >= date_from)
    if date_to:
        query = query.where(Interview.interview_date <= date_to)

    query = query.order_by(  # type: ignore
        Interview.interview_date.desc(),
        nulls_last(Interview.time_est.desc()),
        Interview.created_at.desc(),
    )
    interviews = session.exec(query).all()

    # Build the BD's own interview ID set so we can mark dept-only rows.
    # ONLY active when allowed_dept_ids is explicitly set by an admin.
    bd_owned_ids: Optional[set] = None
    if current_user.role in (UserRole.BD, UserRole.BD_TEAM_LEAD) and current_user.allowed_dept_ids is not None:
        owned_scope = get_bd_entity_scope(current_user, session)
        explicit_depts = get_user_allowed_depts(current_user)
        if explicit_depts:  # explicit non-empty dept list → dept-wide view active
            owned_ids: set[uuid.UUID] = set()
            
            # Pre-fetch other BD user IDs sharing the same entity(ies) for regular BDs
            other_bd_user_ids_set = set()
            if current_user.role == UserRole.BD and owned_scope:
                other_ids = session.exec(
                    other_bd_user_ids_select(current_user)
                ).all()
                other_bd_user_ids_set = set(other_ids)

            for iv in interviews:
                # Own = created by this user.
                is_own = iv.created_by_user_id == current_user.id
                
                # Or attributed to this BD's entity, BUT (for regular BDs) NOT created 
                # by another BD user who shares the exact same entity.
                if owned_scope and iv.bd_id and iv.bd_id in owned_scope:
                    if current_user.role == UserRole.BD:
                        if iv.created_by_user_id not in other_bd_user_ids_set:
                            is_own = True
                    else:
                        is_own = True
                
                if is_own:
                    owned_ids.add(iv.id)
            # Second pass: team lead team members' created interviews are also "owned"
            if current_user.role == UserRole.BD_TEAM_LEAD:
                from sqlmodel import select as _select
                member_ids = session.exec(
                    _select(User.id).where(User.team_lead_user_id == current_user.id)
                ).all()
                member_id_set = set(member_ids)
                for iv in interviews:
                    if iv.created_by_user_id in member_id_set:
                        owned_ids.add(iv.id)
            bd_owned_ids = owned_ids

    thread_ids = {i.thread_id for i in interviews if i.thread_id}
    pipe_map = _pipeline_step_total_map(session, thread_ids)
    lead_map = load_lead_map(session, thread_ids)
    out = []
    for i in interviews:
        is_dept_only = bd_owned_ids is not None and i.id not in bd_owned_ids
        data = _enrich_interview_for_reader(session, i, current_user, bd_dept_only=is_dept_only)
        data = _attach_pipeline_meta(data, i.id, pipe_map)
        out.append(_merge_lead_fields(session, data, i.thread_id, lead_map))
    return out


@router.get("/thread/{thread_id}/lead", response_model=LeadThreadRead)
def get_lead_thread_status(
    thread_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Thread-level lead (opportunity) status: explicit override or derived from latest round."""
    if current_user.role == UserRole.TEAM_MEMBER and not team_member_can_access_thread(
        session, current_user, thread_id
    ):
        raise HTTPException(status_code=404, detail="Interview not found")
    exists = session.exec(
        select(Interview.id).where(Interview.thread_id == thread_id).limit(1)
    ).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Thread not found")
    lt = session.get(LeadThread, thread_id)
    eff = effective_lead_fields(session, thread_id, lt)
    return LeadThreadRead(thread_id=thread_id, **eff)


@router.patch("/thread/{thread_id}/lead", response_model=LeadThreadRead)
def patch_lead_thread_status(
    thread_id: uuid.UUID,
    data: LeadThreadUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Set or clear lead outcome override and notes (superadmin, team members, and BD)."""
    if current_user.role not in (UserRole.SUPERADMIN, UserRole.TEAM_MEMBER, UserRole.BD, UserRole.DEPT_LEAD, UserRole.BD_TEAM_LEAD):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmin, team members, BDs, dept leads, and BD team leads can update lead thread status.",
        )
    if current_user.role == UserRole.TEAM_MEMBER and not team_member_can_access_thread(
        session, current_user, thread_id
    ):
        raise HTTPException(status_code=404, detail="Interview not found")
    exists = session.exec(
        select(Interview.id).where(Interview.thread_id == thread_id).limit(1)
    ).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Thread not found")

    row = ensure_lead_thread(session, thread_id)
    prev_override = (row.outcome_override or "").strip().lower()

    if data.clear_override:
        row.outcome_override = None
        row.unresponsive_since = None
    elif data.outcome_override is not None:
        o = data.outcome_override.strip().lower()
        if not o:
            row.outcome_override = None
            row.unresponsive_since = None
        elif o not in ALLOWED_LEAD_OUTCOMES:
            raise HTTPException(
                status_code=400,
                detail=f"outcome_override must be one of: {', '.join(sorted(ALLOWED_LEAD_OUTCOMES))}",
            )
        else:
            row.outcome_override = o
            if o == "unresponsive":
                if prev_override != "unresponsive":
                    row.unresponsive_since = datetime.utcnow()
            else:
                row.unresponsive_since = None

    if data.notes is not None:
        row.notes = (data.notes.strip()
                     if data.notes.strip() else None) or None

    if data.closed_at is not None:
        row.closed_at = data.closed_at

    if data.is_converted_override is not None:
        row.is_converted_override = data.is_converted_override
    elif data.clear_override:
        row.is_converted_override = None

    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)

    eff = effective_lead_fields(session, thread_id, row)
    record_activity(
        session,
        actor=current_user,
        action="update_lead_thread",
        entity_type="lead_thread",
        entity_id=thread_id,
        message=f"Updated lead thread {thread_id}",
    )
    session.commit()
    return LeadThreadRead(thread_id=thread_id, **eff)


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
    lead_map = load_lead_map(session, {thread_id})
    out = []
    for i in ordered:
        data = _enrich_interview_for_reader(session, i, current_user)
        data = _attach_pipeline_meta(data, i.id, pipe_map)
        out.append(_merge_lead_fields(session, data, i.thread_id, lead_map))
    return out


@router.post("/", response_model=InterviewReadWithDetails, status_code=status.HTTP_201_CREATED)
def create_interview(
    data: InterviewCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new interview record."""
    assert_write_access(current_user)
    payload = data.model_dump()
    _reject_lead_only_interview_status(payload.get("status"))

    tm_cid = candidate_id_for_team_member(session, current_user)
    if current_user.role == UserRole.TEAM_MEMBER:
        if tm_cid is None:
            raise HTTPException(
                status_code=400,
                detail="No candidate record matches your login email. Ask an admin to add a candidate with the same email as your user account.",
            )
        payload["candidate_id"] = tm_cid

    # Validate foreign keys exist (candidate resolved after parent chain below)
    if not session.get(Company, payload["company_id"]):
        raise HTTPException(status_code=404, detail="Company not found")
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
            and parent_for_followup.candidate_id is not None
            and parent_for_followup.candidate_id != tm_cid
        ):
            raise HTTPException(
                status_code=400,
                detail="Parent interview is not part of your candidate pipeline.",
            )
        eff_cand = payload.get("candidate_id")
        if eff_cand is None:
            eff_cand = parent_for_followup.candidate_id
        payload["candidate_id"] = eff_cand
        if payload["candidate_id"] is None:
            raise HTTPException(
                status_code=400,
                detail="Select a candidate for this interview round.",
            )
        payload["thread_id"] = parent_for_followup.thread_id
        payload["parent_interview_id"] = parent_id
    else:
        payload["parent_interview_id"] = None
        new_tid = explicit_thread or uuid.uuid4()
        if payload.get("candidate_id") is None:
            raise HTTPException(
                status_code=400,
                detail="candidate_id is required.",
            )
        # One lead (pipeline) per company — do not start a second root thread.
        if explicit_thread is None:
            existing_company = session.exec(
                select(Interview.id)
                .where(Interview.company_id == payload["company_id"])
                .limit(1)
            ).first()
            if existing_company:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A pipeline already exists for this company. Add rounds from Interviews and chain to the latest interview.",
                )
        payload["thread_id"] = new_tid

    if not session.get(Candidate, payload["candidate_id"]):
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Stamp department from candidate or creator
    if "department_id" not in payload or payload.get("department_id") is None:
        if payload.get("candidate_id"):
            cand = session.get(Candidate, payload["candidate_id"])
            payload["department_id"] = cand.department_id if cand else current_user.department_id
        else:
            payload["department_id"] = current_user.department_id

    payload["created_by_user_id"] = current_user.id
    interview = Interview(**payload)
    session.add(interview)
    lt = ensure_lead_thread(session, interview.thread_id)
    # Root interviews created from the interviews page need arrived_on stamped so that
    # future edits to interview_date don't change the lead arrival date on the Leads page.
    if interview.parent_interview_id is None and lt.arrived_on is None and interview.interview_date:
        lt.arrived_on = interview.interview_date
        lt.updated_at = datetime.utcnow()
        session.add(lt)
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
    _settings = get_settings()
    try_send_interview_created_email(
        _settings,
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
        salary_range=loaded.salary_range or None,
        interview_doc_url=make_presigned_doc_url(
            _settings, loaded.interview_doc_url),
        bd_name=loaded.business_developer.name if loaded.business_developer else None,
        resume_profile_name=loaded.resume_profile.name if loaded.resume_profile else None,
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

    # BD dept-only guard: only applies when allowed_dept_ids was explicitly set by
    # an admin. A BD with just a department_id (no explicit allowed_dept_ids) should
    # NOT be blocked from opening any interview they already appear to own.
    # Superadmin-linked BDs bypass this guard — they have full cross-dept read access.
    if (
        current_user.role in (UserRole.BD, UserRole.BD_TEAM_LEAD)
        and current_user.allowed_dept_ids is not None
        and not (current_user.role == UserRole.BD and is_superadmin_linked_bd(current_user, session))
    ):
        explicit_depts = get_user_allowed_depts(current_user)
        if explicit_depts:  # dept-wide view is active for this user
            owned_scope = get_bd_entity_scope(current_user, session)
            is_own = interview.created_by_user_id == current_user.id
            if owned_scope and interview.bd_id and interview.bd_id in owned_scope:
                if current_user.role == UserRole.BD:
                    other_ids = session.exec(
                        other_bd_user_ids_select(current_user)
                    ).all()
                    if interview.created_by_user_id not in set(other_ids):
                        is_own = True
                else:
                    is_own = True
            
            if current_user.role == UserRole.BD_TEAM_LEAD and not is_own:
                member_ids = session.exec(
                    select(User.id).where(User.team_lead_user_id == current_user.id)
                ).all()
                if interview.created_by_user_id in set(member_ids):
                    is_own = True
            
            if not is_own:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You can only view full details of interviews attributed to your BD.",
                )

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
    assert_write_access(current_user)
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

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed for interview documents",
        )

    key = f"interview_docs/{interview_id}/interview_doc-{uuid.uuid4()}.pdf"
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
            ExtraArgs={"ContentType": "application/pdf", "ACL": "private"},
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


@router.post("/{interview_id}/resume", response_model=InterviewReadWithDetails)
def upload_interview_resume(
    interview_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    current_user: User = Depends(get_current_user),
):
    """Upload a per-interview resume PDF to S3."""
    assert_write_access(current_user)
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    team_member_must_own_interview(session, current_user, interview)

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

    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=400, detail="Only PDF files are allowed for resumes")

    key = f"interview_resumes/{interview_id}/resume-{uuid.uuid4()}.pdf"
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
            ExtraArgs={"ContentType": "application/pdf", "ACL": "private"},
        )
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(status_code=500, detail=f"S3 upload failed: {e}")

    interview.resume_url = f"https://{settings.AWS_S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
    interview.updated_at = datetime.utcnow()
    session.add(interview)
    session.commit()
    loaded = _get_interview_for_enrichment(session, interview_id)
    if not loaded:
        raise HTTPException(status_code=500, detail="Interview reload failed")

    return _finalize_interview_response(session, loaded, current_user)


# ─── Presigned URL upload (browser → S3 directly, much faster) ────────────────

_PRESIGN_ALLOWED_DOC_TYPES = {
    "application/pdf": "pdf",
}
_PRESIGN_ALLOWED_RESUME_TYPES = {"application/pdf": "pdf"}


class PresignRequest(BaseModel):
    upload_type: str  # "document" or "resume"
    content_type: str


class PresignResponse(BaseModel):
    upload_url: str
    s3_key: str


class ConfirmUploadRequest(BaseModel):
    upload_type: str  # "document" or "resume"
    s3_key: str


@router.post("/{interview_id}/presign-upload", response_model=PresignResponse)
def presign_upload(
    interview_id: uuid.UUID,
    body: PresignRequest,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    current_user: User = Depends(get_current_user),
):
    """Generate a presigned S3 PUT URL so the browser can upload directly to S3."""
    assert_write_access(current_user)
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    team_member_must_own_interview(session, current_user, interview)

    if not settings.AWS_S3_BUCKET_NAME:
        raise HTTPException(
            status_code=500, detail="AWS S3 bucket not configured")

    if body.upload_type == "document":
        if body.content_type not in _PRESIGN_ALLOWED_DOC_TYPES:
            raise HTTPException(
                status_code=400, detail="Only DOC, DOCX, and PDF files are allowed")
        ext = _PRESIGN_ALLOWED_DOC_TYPES[body.content_type]
        key = f"interview_docs/{interview_id}/interview_doc-{uuid.uuid4()}.{ext}"
    elif body.upload_type == "resume":
        if body.content_type not in _PRESIGN_ALLOWED_RESUME_TYPES:
            raise HTTPException(
                status_code=400, detail="Only PDF files are allowed for resumes")
        key = f"interview_resumes/{interview_id}/resume-{uuid.uuid4()}.pdf"
    else:
        raise HTTPException(
            status_code=400, detail="upload_type must be 'document' or 'resume'")

    s3_client = _get_s3_client(settings)
    try:
        upload_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.AWS_S3_BUCKET_NAME,
                "Key": key,
                "ContentType": body.content_type,
            },
            ExpiresIn=300,
        )
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate presigned URL: {e}")

    return PresignResponse(upload_url=upload_url, s3_key=key)


@router.post("/{interview_id}/confirm-upload", response_model=InterviewReadWithDetails)
def confirm_upload(
    interview_id: uuid.UUID,
    body: ConfirmUploadRequest,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    current_user: User = Depends(get_current_user),
):
    """After a direct S3 upload using a presigned URL, record the file URL on the interview."""
    assert_write_access(current_user)
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    team_member_must_own_interview(session, current_user, interview)

    if not settings.AWS_S3_BUCKET_NAME:
        raise HTTPException(
            status_code=500, detail="AWS S3 bucket not configured")

    # Validate the key belongs to this interview (prevent storing arbitrary keys)
    expected_prefix_doc = f"interview_docs/{interview_id}/"
    expected_prefix_resume = f"interview_resumes/{interview_id}/"
    if body.upload_type == "document":
        if not body.s3_key.startswith(expected_prefix_doc):
            raise HTTPException(
                status_code=400, detail="Invalid s3_key for this interview")
        url = f"https://{settings.AWS_S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{body.s3_key}"
        interview.interview_doc_url = url
    elif body.upload_type == "resume":
        if not body.s3_key.startswith(expected_prefix_resume):
            raise HTTPException(
                status_code=400, detail="Invalid s3_key for this interview")
        url = f"https://{settings.AWS_S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{body.s3_key}"
        interview.resume_url = url
    else:
        raise HTTPException(
            status_code=400, detail="upload_type must be 'document' or 'resume'")

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
    assert_write_access(current_user)
    interview = _get_interview_for_enrichment(session, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    team_member_must_own_interview(session, current_user, interview)
    assert_bd_lead_write_access(current_user, _thread_primary_bd_id(
        session, interview.thread_id), session)

    update_data = data.model_dump(exclude_unset=True)
    if "status" in update_data:
        _reject_lead_only_interview_status(update_data.get("status"))
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
                raise HTTPException(
                    status_code=404, detail="Parent interview not found")
            if par.company_id != tgt_company:
                raise HTTPException(
                    status_code=400,
                    detail="Parent interview must be for the same company",
                )
            tm_cid = candidate_id_for_team_member(session, current_user)
            if (
                current_user.role == UserRole.TEAM_MEMBER
                and tm_cid is not None
                and par.candidate_id is not None
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

    # Send email notification to the candidate if they have an email address
    cand = loaded.candidate
    if cand and cand.email:
        _settings = get_settings()
        try_send_interview_created_email(
            _settings,
            to_email=cand.email,
            candidate_name=cand.name or "Candidate",
            company_name=loaded.company.name if loaded.company else "",
            role=loaded.role,
            round_name=loaded.round,
            interview_date=loaded.interview_date,
            time_est=loaded.time_est,
            time_pkt=loaded.time_pkt,
            interviewer=loaded.interviewer,
            interview_link=loaded.interview_link,
            is_phone_call=loaded.is_phone_call,
            salary_range=loaded.salary_range or None,
            interview_doc_url=make_presigned_doc_url(
                _settings, loaded.interview_doc_url),
            bd_name=loaded.business_developer.name if loaded.business_developer else None,
            resume_profile_name=loaded.resume_profile.name if loaded.resume_profile else None,
        )

    return _finalize_interview_response(session, loaded, current_user)


@router.delete("/{interview_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_interview(
    interview_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete an interview record."""
    assert_write_access(current_user)
    interview = session.get(Interview, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    team_member_must_own_interview(session, current_user, interview)
    assert_bd_lead_write_access(current_user, _thread_primary_bd_id(
        session, interview.thread_id), session)
    # Check if this is the ONLY interview in this thread
    thread_id = interview.thread_id
    thread_interviews = session.exec(
        select(Interview).where(Interview.thread_id == thread_id)
    ).all()

    is_only_interview = len(thread_interviews) == 1

    if is_only_interview:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the only interview round in this thread. Delete the lead from the Leads page if you want to remove this opportunity entirely.",
        )

    # Not the only interview, delete normally
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

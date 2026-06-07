import uuid
import json
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.deps import get_current_user, assert_write_access
from sqlmodel import Session, select
from app.database import get_session
from app.activity_log import record_activity
from app.dept_scope import apply_dept_filter, get_user_allowed_depts
from app.models.candidate import Candidate
from app.models.department import Department
from app.models.interview import Interview
from app.models.lead_thread import LeadThread
from app.models.user import User
from app.schemas.candidate import (
    CandidateCreate,
    CandidateRead,
    CandidateUpdate,
    CandidateReadWithInterviews,
)
from app.status_utils import computed_status_for_interview_display

router = APIRouter(prefix="/api/v1/candidates", tags=["Candidates"], dependencies=[Depends(get_current_user)])


# ─── Helpers ─────────────────────────────────────────────────

def _serialize_dept_ids(dept_ids: Optional[list[uuid.UUID]]) -> Optional[str]:
    """Serialize a list of department UUIDs to a JSON string."""
    if not dept_ids:
        return None
    return json.dumps([str(d) for d in dept_ids])


def _build_candidate_read(candidate: Candidate, session: Session) -> CandidateRead:
    """Build a CandidateRead response with multi-department data."""
    dept_id_list = candidate.get_department_ids_list()

    if dept_id_list:
        depts = session.exec(
            select(Department).where(Department.id.in_([uuid.UUID(d) for d in dept_id_list]))
        ).all()
        dept_map = {str(d.id): d.name for d in depts}
        dept_names = [dept_map.get(d_id, d_id) for d_id in dept_id_list]
        primary_dept = depts[0] if depts else None
    else:
        dept_names = []
        primary_dept = session.get(Department, candidate.department_id) if candidate.department_id else None

    return CandidateRead(
        id=candidate.id,
        name=candidate.name,
        email=candidate.email,
        is_active=candidate.is_active,
        department_id=candidate.department_id,
        department_name=primary_dept.name if primary_dept else None,
        department_ids=dept_id_list if dept_id_list else None,
        department_names=dept_names if dept_names else None,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
    )


# ─── Routes ──────────────────────────────────────────────────

@router.get("/", response_model=list[CandidateRead])
def list_candidates(
    department_id: Optional[uuid.UUID] = Query(None, description="Filter by department (cross-dept roles only)"),
    is_active: Optional[bool] = Query(None, description="Filter by active status. Omit for all, True for active, False for inactive."),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List candidates. Team members see their own department only; cross-dept roles see all (or filtered by ?department_id=)."""
    query = (
        select(Candidate, Department)
        .join(Department, Candidate.department_id == Department.id, isouter=True)
        .order_by(Candidate.name)
    )
    query = apply_dept_filter(query, Candidate, current_user, department_id, session)
    if is_active is not None:
        query = query.where(Candidate.is_active == is_active)
    rows = session.exec(query).all()

    result = []
    for c, _ in rows:
        dept_id_list = c.get_department_ids_list()
        if dept_id_list:
            depts = session.exec(
                select(Department).where(Department.id.in_([uuid.UUID(d) for d in dept_id_list]))
            ).all()
            dept_map = {str(d.id): d.name for d in depts}
            dept_names = [dept_map.get(d_id, d_id) for d_id in dept_id_list]
            primary_dept_name = dept_names[0] if dept_names else None
        else:
            dept_names = []
            primary_dept_name = None

        result.append(CandidateRead(
            id=c.id,
            name=c.name,
            email=c.email,
            is_active=c.is_active,
            department_id=c.department_id,
            department_name=primary_dept_name,
            department_ids=dept_id_list if dept_id_list else None,
            department_names=dept_names if dept_names else None,
            created_at=c.created_at,
            updated_at=c.updated_at,
        ))
    return result


@router.post("/", response_model=CandidateRead, status_code=status.HTTP_201_CREATED)
def create_candidate(
    data: CandidateCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new candidate. department_ids takes priority; department_id is automatically set to the first entry."""
    assert_write_access(current_user)

    # Resolve department list from input
    dept_ids: list[uuid.UUID] = []
    if data.department_ids:
        dept_ids = data.department_ids
    elif data.department_id:
        dept_ids = [data.department_id]

    # Auto-stamp from user's department if none provided
    if not dept_ids and current_user.department_id:
        dept_ids = [current_user.department_id]

    # Fallback: first allowed dept
    if not dept_ids:
        allowed = get_user_allowed_depts(current_user)
        if allowed:
            dept_ids = [allowed[0]]

    # Last-resort fallback: first dept in DB
    if not dept_ids:
        first_dept = session.exec(select(Department).order_by(Department.created_at)).first()
        if first_dept:
            dept_ids = [first_dept.id]

    if not dept_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid department_id is required. Create a department in the system first.",
        )

    primary_dept_id = dept_ids[0]
    candidate = Candidate(
        name=data.name,
        email=data.email,
        is_active=data.is_active,
        department_id=primary_dept_id,
        department_ids=_serialize_dept_ids(dept_ids),
    )
    session.add(candidate)
    session.flush()
    record_activity(
        session,
        actor=current_user,
        action="create_candidate",
        entity_type="candidate",
        entity_id=candidate.id,
        message=f"Created candidate '{candidate.name}'",
    )
    session.commit()
    session.refresh(candidate)
    return _build_candidate_read(candidate, session)


@router.get("/{candidate_id}", response_model=CandidateReadWithInterviews)
def get_candidate(candidate_id: uuid.UUID, session: Session = Depends(get_session)):
    """Get a candidate with their interview history."""
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    # Build interview summaries with company name
    interview_summaries = []
    for interview in candidate.interviews:
        interview_summaries.append({
            "id": interview.id,
            "role": interview.role,
            "round": interview.round,
            "interview_date": interview.interview_date,
            "time_est": interview.time_est,
            "status": interview.status,
            "computed_status": computed_status_for_interview_display(
                interview.status, interview.interview_date
            ),
            "company_name": interview.company.name if interview.company else None,
        })

    base = _build_candidate_read(candidate, session)
    return CandidateReadWithInterviews(
        **base.model_dump(),
        interviews=interview_summaries,
    )


@router.put("/{candidate_id}", response_model=CandidateRead)
def update_candidate(
    candidate_id: uuid.UUID,
    data: CandidateUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update a candidate."""
    assert_write_access(current_user)
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    update_data = data.model_dump(exclude_unset=True)

    # Handle department_ids specially
    if "department_ids" in update_data:
        raw_dept_ids = update_data.pop("department_ids")
        if raw_dept_ids:
            dept_ids = [uuid.UUID(str(d)) for d in raw_dept_ids]
            candidate.department_ids = _serialize_dept_ids(dept_ids)
            candidate.department_id = dept_ids[0]
        else:
            candidate.department_ids = None
            # Keep existing department_id if no new list provided
        if "department_id" in update_data:
            update_data.pop("department_id")  # don't double-write
    elif "department_id" in update_data:
        # Single dept update — also update the department_ids list
        new_dept_id = update_data["department_id"]
        if new_dept_id:
            candidate.department_ids = _serialize_dept_ids([uuid.UUID(str(new_dept_id))])

    for key, value in update_data.items():
        setattr(candidate, key, value)
    candidate.updated_at = datetime.utcnow()

    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    record_activity(
        session,
        actor=current_user,
        action="update_candidate",
        entity_type="candidate",
        entity_id=candidate.id,
        message=f"Updated candidate '{candidate.name}'",
    )
    session.commit()
    return _build_candidate_read(candidate, session)


@router.patch("/{candidate_id}/status", response_model=CandidateRead)
def toggle_candidate_status(
    candidate_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Toggle a candidate's active/inactive status."""
    assert_write_access(current_user)
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    candidate.is_active = not candidate.is_active
    candidate.updated_at = datetime.utcnow()
    session.add(candidate)
    record_activity(
        session,
        actor=current_user,
        action="toggle_candidate_status",
        entity_type="candidate",
        entity_id=candidate.id,
        message=f"Marked candidate '{candidate.name}' as {'active' if candidate.is_active else 'inactive'}",
    )
    session.commit()
    session.refresh(candidate)
    return _build_candidate_read(candidate, session)


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_candidate(
    candidate_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a candidate. Nullifies interview and lead-thread references before removal."""
    assert_write_access(current_user)
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate_name = candidate.name

    # Nullify FK references so the delete doesn't violate constraints
    for iv in session.exec(select(Interview).where(Interview.candidate_id == candidate_id)).all():
        iv.candidate_id = None
        session.add(iv)
    for lt in session.exec(select(LeadThread).where(LeadThread.entertaining_candidate_id == candidate_id)).all():
        lt.entertaining_candidate_id = None
        session.add(lt)

    session.delete(candidate)
    record_activity(
        session,
        actor=current_user,
        action="delete_candidate",
        entity_type="candidate",
        entity_id=candidate_id,
        message=f"Deleted candidate '{candidate_name}'",
    )
    session.commit()

import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.deps import get_current_user
from sqlmodel import Session, select
from app.database import get_session
from app.activity_log import record_activity
from app.dept_scope import apply_dept_filter
from app.models.candidate import Candidate
from app.models.department import Department
from app.models.user import User
from app.schemas.candidate import (
    CandidateCreate,
    CandidateRead,
    CandidateUpdate,
    CandidateReadWithInterviews,
)
from app.status_utils import computed_status_for_interview_display

router = APIRouter(prefix="/api/v1/candidates", tags=["Candidates"], dependencies=[Depends(get_current_user)])


@router.get("/", response_model=list[CandidateRead])
def list_candidates(
    department_id: Optional[uuid.UUID] = Query(None, description="Filter by department (cross-dept roles only)"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List candidates. Team members see their own department only; cross-dept roles see all (or filtered by ?department_id=)."""
    query = (
        select(Candidate, Department)
        .join(Department, Candidate.department_id == Department.id, isouter=True)
        .order_by(Candidate.name)
    )
    query = apply_dept_filter(query, Candidate, current_user, department_id)
    rows = session.exec(query).all()
    return [
        CandidateRead(
            id=c.id,
            name=c.name,
            email=c.email,
            department_id=c.department_id,
            department_name=d.name if d else None,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c, d in rows
    ]


@router.post("/", response_model=CandidateRead, status_code=status.HTTP_201_CREATED)
def create_candidate(
    data: CandidateCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new candidate. department_id is stamped automatically from the creator's department."""
    dept_id = data.department_id or current_user.department_id
    candidate = Candidate(name=data.name, email=data.email, department_id=dept_id)
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
    dept = session.get(Department, candidate.department_id) if candidate.department_id else None
    return CandidateRead(
        id=candidate.id, name=candidate.name, email=candidate.email,
        department_id=candidate.department_id,
        department_name=dept.name if dept else None,
        created_at=candidate.created_at, updated_at=candidate.updated_at,
    )


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

    return CandidateReadWithInterviews(
        id=candidate.id,
        name=candidate.name,
        email=candidate.email,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
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
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    update_data = data.model_dump(exclude_unset=True)
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
    dept = session.get(Department, candidate.department_id) if candidate.department_id else None
    return CandidateRead(
        id=candidate.id, name=candidate.name, email=candidate.email,
        department_id=candidate.department_id,
        department_name=dept.name if dept else None,
        created_at=candidate.created_at, updated_at=candidate.updated_at,
    )


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_candidate(
    candidate_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a candidate."""
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    candidate_name = candidate.name
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

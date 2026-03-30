import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from app.deps import get_current_user
from sqlmodel import Session, select
from app.database import get_session
from app.models.candidate import Candidate
from app.schemas.candidate import (
    CandidateCreate,
    CandidateRead,
    CandidateUpdate,
    CandidateReadWithInterviews,
)

router = APIRouter(prefix="/api/v1/candidates", tags=["Candidates"], dependencies=[Depends(get_current_user)])


@router.get("/", response_model=list[CandidateRead])
def list_candidates(session: Session = Depends(get_session)):
    """List all candidates."""
    candidates = session.exec(select(Candidate).order_by(Candidate.name)).all()
    return candidates


@router.post("/", response_model=CandidateRead, status_code=status.HTTP_201_CREATED)
def create_candidate(data: CandidateCreate, session: Session = Depends(get_session)):
    """Create a new candidate."""
    candidate = Candidate(name=data.name)
    session.add(candidate)
    session.commit()
    session.refresh(candidate)
    return candidate


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
            "status": interview.status,
            "company_name": interview.company.name if interview.company else None,
        })

    return CandidateReadWithInterviews(
        id=candidate.id,
        name=candidate.name,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
        interviews=interview_summaries,
    )


@router.put("/{candidate_id}", response_model=CandidateRead)
def update_candidate(
    candidate_id: uuid.UUID,
    data: CandidateUpdate,
    session: Session = Depends(get_session),
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
    return candidate


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_candidate(candidate_id: uuid.UUID, session: Session = Depends(get_session)):
    """Delete a candidate."""
    candidate = session.get(Candidate, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    session.delete(candidate)
    session.commit()

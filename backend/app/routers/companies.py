import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from app.deps import get_current_user
from sqlmodel import Session, select
from app.database import get_session
from app.activity_log import record_activity
from app.models.company import Company
from app.models.user import User
from app.schemas.company import (
    CompanyCreate,
    CompanyRead,
    CompanyUpdate,
    CompanyReadWithInterviews,
)

router = APIRouter(prefix="/api/v1/companies", tags=["Companies"], dependencies=[Depends(get_current_user)])


@router.get("/", response_model=list[CompanyRead])
def list_companies(session: Session = Depends(get_session)):
    """List all companies."""
    companies = session.exec(select(Company).order_by(Company.name)).all()
    return companies


@router.post("/", response_model=CompanyRead, status_code=status.HTTP_201_CREATED)
def create_company(
    data: CompanyCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new company."""
    company = Company(name=data.name, is_staffing_firm=data.is_staffing_firm)
    session.add(company)
    session.flush()
    record_activity(
        session,
        actor=current_user,
        action="create_company",
        entity_type="company",
        entity_id=company.id,
        message=f"Created company '{company.name}'",
    )
    session.commit()
    session.refresh(company)
    return company


@router.get("/{company_id}", response_model=CompanyReadWithInterviews)
def get_company(company_id: uuid.UUID, session: Session = Depends(get_session)):
    """Get a company with its interview history."""
    company = session.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    interview_summaries = []
    for interview in company.interviews:
        interview_summaries.append({
            "id": interview.id,
            "role": interview.role,
            "round": interview.round,
            "interview_date": interview.interview_date,
            "status": interview.status,
            "candidate_name": interview.candidate.name if interview.candidate else None,
        })

    return CompanyReadWithInterviews(
        id=company.id,
        name=company.name,
        is_staffing_firm=company.is_staffing_firm,
        created_at=company.created_at,
        updated_at=company.updated_at,
        interviews=interview_summaries,
    )


@router.put("/{company_id}", response_model=CompanyRead)
def update_company(
    company_id: uuid.UUID,
    data: CompanyUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update a company."""
    company = session.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(company, key, value)
    company.updated_at = datetime.utcnow()

    session.add(company)
    session.commit()
    session.refresh(company)
    record_activity(
        session,
        actor=current_user,
        action="update_company",
        entity_type="company",
        entity_id=company.id,
        message=f"Updated company '{company.name}'",
    )
    session.commit()
    return company


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company(
    company_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Delete a company."""
    company = session.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    company_name = company.name
    session.delete(company)
    record_activity(
        session,
        actor=current_user,
        action="delete_company",
        entity_type="company",
        entity_id=company_id,
        message=f"Deleted company '{company_name}'",
    )
    session.commit()

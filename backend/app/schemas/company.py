import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class CompanyCreate(BaseModel):
    name: str
    staffing_firm: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    staffing_firm: Optional[str] = None


class CompanyRead(BaseModel):
    id: uuid.UUID
    name: str
    staffing_firm: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InterviewSummary(BaseModel):
    """Minimal interview info for nested display in company detail."""
    id: uuid.UUID
    role: str
    round: str
    interview_date: Optional[datetime] = None
    status: Optional[str] = None
    candidate_name: Optional[str] = None

    model_config = {"from_attributes": True}


class CompanyReadWithInterviews(CompanyRead):
    interviews: list["InterviewSummary"] = []

import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class CandidateCreate(BaseModel):
    name: str


class CandidateUpdate(BaseModel):
    name: Optional[str] = None


class CandidateRead(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InterviewSummary(BaseModel):
    """Minimal interview info for nested display."""
    id: uuid.UUID
    role: str
    round: str
    interview_date: Optional[datetime] = None
    status: Optional[str] = None
    company_name: Optional[str] = None

    model_config = {"from_attributes": True}


class CandidateReadWithInterviews(CandidateRead):
    interviews: list["InterviewSummary"] = []

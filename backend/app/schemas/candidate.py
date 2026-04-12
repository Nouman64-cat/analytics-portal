import uuid
from datetime import datetime, time
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional


class CandidateCreate(BaseModel):
    name: str
    email: Optional[EmailStr] = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_str_email_none(cls, v):
        if v == "":
            return None
        return v


class CandidateUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None

    @field_validator("email", mode="before")
    @classmethod
    def empty_str_email_none(cls, v):
        if v == "":
            return None
        return v


class CandidateRead(BaseModel):
    id: uuid.UUID
    name: str
    email: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InterviewSummary(BaseModel):
    """Minimal interview info for nested display."""
    id: uuid.UUID
    role: str
    round: str
    interview_date: Optional[datetime] = None
    time_est: Optional[time] = None
    status: Optional[str] = None
    computed_status: str = "Unresponsed"
    company_name: Optional[str] = None

    model_config = {"from_attributes": True}


class CandidateReadWithInterviews(CandidateRead):
    interviews: list["InterviewSummary"] = []

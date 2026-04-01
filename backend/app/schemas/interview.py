import uuid
from datetime import datetime, date, time
from pydantic import BaseModel
from typing import Optional


class InterviewCreate(BaseModel):
    company_id: uuid.UUID
    candidate_id: uuid.UUID
    resume_profile_id: uuid.UUID
    role: str
    salary_range: Optional[str] = None
    round: str
    interview_date: Optional[date] = None
    time_est: Optional[time] = None
    time_pkt: Optional[time] = None
    status: Optional[str] = None
    feedback: Optional[str] = None
    bd_id: Optional[uuid.UUID] = None
    interviewer: Optional[str] = None
    interview_link: Optional[str] = None
    is_phone_call: bool = False


class InterviewUpdate(BaseModel):
    company_id: Optional[uuid.UUID] = None
    candidate_id: Optional[uuid.UUID] = None
    resume_profile_id: Optional[uuid.UUID] = None
    role: Optional[str] = None
    salary_range: Optional[str] = None
    round: Optional[str] = None
    interview_date: Optional[date] = None
    time_est: Optional[time] = None
    time_pkt: Optional[time] = None
    status: Optional[str] = None
    feedback: Optional[str] = None
    bd_id: Optional[uuid.UUID] = None
    interviewer: Optional[str] = None
    interview_link: Optional[str] = None
    is_phone_call: Optional[bool] = None


class InterviewRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    candidate_id: uuid.UUID
    resume_profile_id: uuid.UUID
    role: str
    salary_range: Optional[str] = None
    round: str
    interview_date: Optional[date] = None
    time_est: Optional[time] = None
    time_pkt: Optional[time] = None
    status: Optional[str] = None
    feedback: Optional[str] = None
    bd_id: Optional[uuid.UUID] = None
    interviewer: Optional[str] = None
    interview_link: Optional[str] = None
    is_phone_call: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class InterviewReadWithDetails(InterviewRead):
    """Interview with expanded company, candidate, profile, and BD names."""
    company_name: Optional[str] = None
    candidate_name: Optional[str] = None
    resume_profile_name: Optional[str] = None
    bd_name: Optional[str] = None
    computed_status: str = "Unresponsed"

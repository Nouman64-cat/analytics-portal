import uuid
from datetime import datetime, date, time
from pydantic import BaseModel
from typing import Optional


class InterviewCreate(BaseModel):
    company_id: uuid.UUID
    candidate_id: Optional[uuid.UUID] = None
    resume_profile_id: uuid.UUID
    role: str
    # Link to previous round (same company / candidate / profile required); inherits thread_id from parent
    parent_interview_id: Optional[uuid.UUID] = None
    # Optional explicit thread when not using parent (advanced); otherwise a new thread is created
    thread_id: Optional[uuid.UUID] = None
    salary_range: Optional[str] = None
    round: str
    interview_date: Optional[date] = None
    time_est: Optional[time] = None
    time_pkt: Optional[time] = None
    status: Optional[str] = None
    feedback: Optional[str] = None
    recruiter_feedback: Optional[str] = None
    bd_id: Optional[uuid.UUID] = None
    interviewer: Optional[str] = None
    interview_link: Optional[str] = None
    interview_doc_url: Optional[str] = None
    is_phone_call: bool = False


class InterviewUpdate(BaseModel):
    company_id: Optional[uuid.UUID] = None
    candidate_id: Optional[uuid.UUID] = None
    resume_profile_id: Optional[uuid.UUID] = None
    thread_id: Optional[uuid.UUID] = None
    parent_interview_id: Optional[uuid.UUID] = None
    role: Optional[str] = None
    salary_range: Optional[str] = None
    round: Optional[str] = None
    interview_date: Optional[date] = None
    time_est: Optional[time] = None
    time_pkt: Optional[time] = None
    status: Optional[str] = None
    feedback: Optional[str] = None
    recruiter_feedback: Optional[str] = None
    bd_id: Optional[uuid.UUID] = None
    interviewer: Optional[str] = None
    interview_link: Optional[str] = None
    interview_doc_url: Optional[str] = None
    is_phone_call: Optional[bool] = None


class InterviewRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    candidate_id: Optional[uuid.UUID] = None
    resume_profile_id: uuid.UUID
    thread_id: uuid.UUID
    parent_interview_id: Optional[uuid.UUID] = None
    role: str
    salary_range: Optional[str] = None
    round: str
    interview_date: Optional[date] = None
    time_est: Optional[time] = None
    time_pkt: Optional[time] = None
    status: Optional[str] = None
    feedback: Optional[str] = None
    recruiter_feedback: Optional[str] = None
    bd_id: Optional[uuid.UUID] = None
    interviewer: Optional[str] = None
    interview_link: Optional[str] = None
    is_phone_call: bool = False
    interview_doc_url: Optional[str] = None
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
    # 1-based position in the full thread (all rounds); set when API scopes list per user
    pipeline_thread_step: Optional[int] = None
    pipeline_thread_total: Optional[int] = None
    # Thread-level lead (opportunity); duplicated on each round for convenience
    lead_outcome: Optional[str] = None
    lead_status_label: Optional[str] = None
    lead_source: Optional[str] = None
    lead_notes: Optional[str] = None
    lead_closed_at: Optional[datetime] = None

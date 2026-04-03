import uuid
from datetime import datetime, date, time
from sqlmodel import SQLModel, Field, Relationship
from typing import Optional


class Interview(SQLModel, table=True):
    """Individual interview records linking candidate, profile, and company."""

    __tablename__ = "interviews"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    # Foreign keys
    company_id: uuid.UUID = Field(foreign_key="companies.id", index=True)
    candidate_id: uuid.UUID = Field(foreign_key="candidates.id", index=True)
    resume_profile_id: uuid.UUID = Field(
        foreign_key="resume_profiles.id", index=True)

    # Interview details
    role: str = Field(max_length=500)
    salary_range: Optional[str] = Field(default=None, max_length=255)
    round: str = Field(max_length=100)
    interview_date: Optional[date] = Field(default=None, index=True)
    time_est: Optional[time] = Field(default=None)
    time_pkt: Optional[time] = Field(default=None)
    status: Optional[str] = Field(default=None, max_length=500)
    # Internal notes after your presentation (SOP)
    feedback: Optional[str] = Field(default=None)
    # Notes from the recruiter (outcome context, separate from pipeline status)
    recruiter_feedback: Optional[str] = Field(default=None)
    bd_id: Optional[uuid.UUID] = Field(
        default=None, foreign_key="business_developers.id", index=True)
    interviewer: Optional[str] = Field(default=None, max_length=255)
    interview_link: Optional[str] = Field(default=None, max_length=1000)
    interview_doc_url: Optional[str] = Field(default=None, max_length=1000)
    is_phone_call: bool = Field(default=False)

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    company: Optional["Company"] = Relationship(back_populates="interviews")
    candidate: Optional["Candidate"] = Relationship(
        back_populates="interviews")
    resume_profile: Optional["ResumeProfile"] = Relationship(
        back_populates="interviews")
    business_developer: Optional["BusinessDeveloper"] = Relationship()


# Import here to avoid circular imports — these are needed for relationship resolution
from app.models.company import Company  # noqa: E402, F811
from app.models.candidate import Candidate  # noqa: E402, F811
from app.models.resume_profile import ResumeProfile  # noqa: E402, F811
from app.models.business_developer import BusinessDeveloper  # noqa: E402, F811

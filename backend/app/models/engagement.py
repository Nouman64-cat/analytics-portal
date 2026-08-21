import uuid
from datetime import datetime, date, time
from sqlmodel import SQLModel, Field, Relationship
from typing import Optional


class Engagement(SQLModel, table=True):
    """Engagement records representing calendar events, meetings, or sessions."""

    __tablename__ = "engagements"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)

    # Subject / description
    title: str = Field(max_length=500)
    description: Optional[str] = Field(default=None)

    # Timings
    start_time: datetime = Field(index=True)
    end_time: datetime = Field(index=True)
    is_all_day: bool = Field(default=False)

    # Locations & Links
    location: Optional[str] = Field(default=None, max_length=500)
    meeting_link: Optional[str] = Field(default=None, max_length=1000)

    # Recurrence rules (RFC 5545 RRULE format)
    recurrence_rule: Optional[str] = Field(default=None, max_length=1000)

    # Status settings
    status: Optional[str] = Field(default="scheduled", max_length=100) # scheduled, completed, cancelled, tentative
    show_as: Optional[str] = Field(default="busy", max_length=100)     # busy, free, tentative, oof

    # Minutes before start_time to alert the organizer; null = no reminder
    reminder_minutes: Optional[int] = Field(default=15)

    # Core system links
    organizer_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    department_id: Optional[uuid.UUID] = Field(default=None, foreign_key="departments.id", index=True)

    # Associated entities
    company_id: Optional[uuid.UUID] = Field(default=None, foreign_key="companies.id", index=True)
    candidate_id: Optional[uuid.UUID] = Field(default=None, foreign_key="candidates.id", index=True)
    resume_profile_id: Optional[uuid.UUID] = Field(default=None, foreign_key="resume_profiles.id", index=True)
    bd_id: Optional[uuid.UUID] = Field(default=None, foreign_key="business_developers.id", index=True)

    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    organizer: Optional["User"] = Relationship()
    department: Optional["Department"] = Relationship()
    company: Optional["Company"] = Relationship()
    candidate: Optional["Candidate"] = Relationship()
    resume_profile: Optional["ResumeProfile"] = Relationship()
    business_developer: Optional["BusinessDeveloper"] = Relationship()


# Import targets to resolve SQLModel relationships
from app.models.user import User  # noqa: E402
from app.models.department import Department  # noqa: E402
from app.models.company import Company  # noqa: E402
from app.models.candidate import Candidate  # noqa: E402
from app.models.resume_profile import ResumeProfile  # noqa: E402
from app.models.business_developer import BusinessDeveloper  # noqa: E402

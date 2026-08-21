import uuid
from datetime import datetime, date, time, timezone
from pydantic import BaseModel, model_validator, field_validator
from typing import Optional


def _to_naive_utc(v: Optional[datetime]) -> Optional[datetime]:
    """Normalize an incoming datetime to naive UTC.

    start_time/end_time are stored in a `timestamp without time zone` column. The DB session's
    TimeZone GUC is not UTC (e.g. America/Chicago in this deployment), so handing psycopg2 a
    tz-aware datetime lets Postgres silently convert it to that session zone on insert, shifting
    the stored wall-clock time by the zone offset. Stripping tzinfo here — after converting to
    UTC ourselves — keeps every stored value unambiguously UTC regardless of session settings.
    """
    if v is not None and v.tzinfo is not None:
        return v.astimezone(timezone.utc).replace(tzinfo=None)
    return v


class EngagementCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    is_all_day: bool = False
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    recurrence_rule: Optional[str] = None
    status: Optional[str] = "scheduled"
    show_as: Optional[str] = "busy"
    reminder_minutes: Optional[int] = 15
    department_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    candidate_id: Optional[uuid.UUID] = None
    resume_profile_id: Optional[uuid.UUID] = None
    bd_id: Optional[uuid.UUID] = None

    @field_validator("start_time", "end_time")
    @classmethod
    def _normalize_tz(cls, v: datetime) -> datetime:
        return _to_naive_utc(v)

    @model_validator(mode="after")
    def validate_times(self) -> "EngagementCreate":
        if self.start_time and self.end_time and self.start_time > self.end_time:
            raise ValueError("end_time must be after start_time")
        return self


class EngagementUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_all_day: Optional[bool] = None
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    recurrence_rule: Optional[str] = None
    status: Optional[str] = None
    show_as: Optional[str] = None
    reminder_minutes: Optional[int] = None
    department_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    candidate_id: Optional[uuid.UUID] = None
    resume_profile_id: Optional[uuid.UUID] = None
    bd_id: Optional[uuid.UUID] = None

    @field_validator("start_time", "end_time")
    @classmethod
    def _normalize_tz(cls, v: Optional[datetime]) -> Optional[datetime]:
        return _to_naive_utc(v)

    @model_validator(mode="after")
    def validate_times(self) -> "EngagementUpdate":
        if self.start_time and self.end_time and self.start_time > self.end_time:
            raise ValueError("end_time must be after start_time")
        return self


class EngagementRead(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    is_all_day: bool
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    recurrence_rule: Optional[str] = None
    status: str
    show_as: str
    reminder_minutes: Optional[int] = None
    organizer_id: uuid.UUID
    department_id: Optional[uuid.UUID] = None
    company_id: Optional[uuid.UUID] = None
    candidate_id: Optional[uuid.UUID] = None
    resume_profile_id: Optional[uuid.UUID] = None
    bd_id: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EngagementReadWithDetails(EngagementRead):
    organizer_email: Optional[str] = None
    organizer_name: Optional[str] = None
    company_name: Optional[str] = None
    candidate_name: Optional[str] = None
    resume_profile_name: Optional[str] = None
    bd_name: Optional[str] = None
    department_name: Optional[str] = None

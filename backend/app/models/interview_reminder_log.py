import uuid
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import SQLModel, Field


class InterviewReminderLog(SQLModel, table=True):
    """Tracks sent reminders so each offset is sent once per interview time."""

    __tablename__ = "interview_reminder_logs"
    __table_args__ = (
        UniqueConstraint(
            "interview_id",
            "reminder_type",
            "scheduled_for_utc",
            name="uq_interview_reminder_once",
        ),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    interview_id: uuid.UUID = Field(index=True, foreign_key="interviews.id")
    reminder_type: str = Field(max_length=20, index=True)  # t_minus_60 / t_minus_30
    scheduled_for_utc: datetime = Field(index=True)
    sent_at_utc: datetime = Field(default_factory=datetime.utcnow, index=True)


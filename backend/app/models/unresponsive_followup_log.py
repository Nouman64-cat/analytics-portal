import uuid
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import SQLModel, Field


class UnresponsiveFollowUpLog(SQLModel, table=True):
    """Tracks that a follow-up notification was sent for an unresponsive lead.

    One row per thread_id — the notification is sent once when the lead has been
    unresponsive for 15+ days and never repeated for the same thread.
    """

    __tablename__ = "unresponsive_followup_logs"
    __table_args__ = (
        UniqueConstraint("thread_id", name="uq_unresponsive_followup_once"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    thread_id: uuid.UUID = Field(index=True, foreign_key="lead_threads.thread_id")
    sent_at_utc: datetime = Field(default_factory=datetime.utcnow, index=True)

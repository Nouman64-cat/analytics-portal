"""One row per pipeline thread (BD lead / opportunity), keyed by Interview.thread_id."""

import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel


class LeadThread(SQLModel, table=True):
    __tablename__ = "lead_threads"

    thread_id: uuid.UUID = Field(primary_key=True)
    # Optional: BD-facing “who entertains this opportunity” (rounds may still use other candidates).
    entertaining_candidate_id: Optional[uuid.UUID] = Field(
        default=None,
        foreign_key="candidates.id",
    )
    # When set, overrides derived status from the latest interview in the thread.
    outcome_override: Optional[str] = Field(default=None, max_length=100)
    notes: Optional[str] = Field(default=None)
    closed_at: Optional[datetime] = Field(default=None)
    #: Set when `outcome_override` becomes `unresponsive`; used to auto-mark dead after 30 days.
    unresponsive_since: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

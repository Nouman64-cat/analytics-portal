import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LeadThreadRead(BaseModel):
    thread_id: uuid.UUID
    lead_outcome: str
    lead_status_label: str
    lead_source: str
    lead_notes: Optional[str] = None
    lead_closed_at: Optional[datetime] = None


class LeadThreadUpdate(BaseModel):
    """Set outcome_override to pin lead status; omit or clear_override to derive from pipeline."""

    outcome_override: Optional[str] = Field(
        default=None,
        description="One of: active, unresponsive, dropped, dead, rejected, closed",
    )
    notes: Optional[str] = None
    clear_override: bool = False
    closed_at: Optional[datetime] = None

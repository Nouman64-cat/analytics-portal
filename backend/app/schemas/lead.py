import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class LeadCreate(BaseModel):
    """Create a new pipeline thread with an initial “Lead” round (then add interviews as usual)."""

    company_id: uuid.UUID
    resume_profile_id: uuid.UUID
    role: str = Field(..., min_length=1, max_length=500, description="Job / opportunity title")
    salary_range: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Compensation band for this opportunity (stored on the initial round).",
    )
    bd_id: Optional[uuid.UUID] = None
    candidate_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Who entertains this lead (BD relationship); per-round candidates are set on interviews.",
    )
    notes: Optional[str] = Field(default=None, description="Stored on the lead thread")
    arrived_on: Optional[date] = Field(default=None, description="When the lead was received (sets interview_date on initial round)")



class LeadUpdate(BaseModel):
    """Patch lead thread + earliest interview row (opportunity defaults). Company is fixed."""

    resume_profile_id: Optional[uuid.UUID] = None
    role: Optional[str] = Field(None, min_length=1, max_length=500)
    salary_range: Optional[str] = Field(None, max_length=255)
    bd_id: Optional[uuid.UUID] = None
    candidate_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Who entertains this lead; omit or null to clear.",
    )
    notes: Optional[str] = None
    arrived_on: Optional[date] = Field(None, description="Update the arrival date on the initial lead round")



class LeadListItem(BaseModel):
    """One BD opportunity (pipeline thread): parent for interview rounds."""

    thread_id: uuid.UUID
    company_id: uuid.UUID
    company_name: Optional[str] = None
    candidate_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Entertaining candidate on the lead thread if set; else first round with a candidate.",
    )
    candidate_name: Optional[str] = None
    resume_profile_id: uuid.UUID
    resume_profile_name: Optional[str] = None
    primary_bd_id: Optional[uuid.UUID] = Field(
        default=None,
        description="BD on the earliest interview that has bd_id (chronological).",
    )
    primary_bd_name: Optional[str] = None
    interview_count: int = 0
    first_interview_date: Optional[date] = None
    last_interview_date: Optional[date] = None
    first_interview_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Open Interviews detail with this id.",
    )
    last_interview_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Latest step in the thread — use as parent_interview_id for the next round.",
    )
    primary_role: Optional[str] = Field(
        default=None,
        description="Job title from the earliest step in the thread.",
    )
    salary_range: Optional[str] = Field(
        default=None,
        description="Compensation band from the earliest step (opportunity default).",
    )
    last_round: Optional[str] = Field(
        default=None,
        description="Round label on the latest step (for suggesting the next round).",
    )
    lead_outcome: str = ""
    lead_status_label: str = ""
    lead_source: str = "derived"
    lead_notes: Optional[str] = None


class LeadListStats(BaseModel):
    """Aggregates for the current filter set (before pagination)."""

    total_leads: int
    in_pipeline: int
    active: int
    terminal: int
    other: int
    rejected: int
    dropped: int
    closed: int
    dead: int


class LeadListPage(BaseModel):
    items: list[LeadListItem]
    total: int
    page: int
    page_size: int
    stats: LeadListStats

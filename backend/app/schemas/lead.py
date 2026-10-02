import uuid
from datetime import date, datetime, time
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
    notes: Optional[str] = Field(default=None, description="Team member notes (stored on the lead thread)")
    bd_notes: Optional[str] = Field(default=None, description="BD/superadmin notes (stored on the lead thread)")
    arrived_on: Optional[date] = Field(default=None, description="When the lead was received (sets interview_date on initial round)")
    active_department_id: Optional[uuid.UUID] = Field(
        default=None,
        description="The department context that was active when the lead was created. "
                    "When provided, this takes priority over the candidate's primary department_id "
                    "so that multi-dept candidates are stamped to the correct department.",
    )
    # First interview's details — set when the lead comes from a pasted "Interview Scheduled!"
    # message. Without them the initial round is "1st" dated on arrived_on, as before.
    round: Optional[str] = Field(default=None, max_length=100)
    interviewer: Optional[str] = Field(default=None, max_length=255)
    interview_date: Optional[date] = None
    time_est: Optional[time] = Field(default=None, description="US Eastern; PKT is derived from it")


class LeadMessageParseRequest(BaseModel):
    """A pasted lead message plus the options the user can pick in the lead form."""

    class Option(BaseModel):
        id: str
        name: str

    message: str = Field(..., min_length=1, max_length=4000)
    companies: list[Option] = Field(default_factory=list, max_length=5000)
    resume_profiles: list[Option] = Field(default_factory=list, max_length=2000)
    candidates: list[Option] = Field(default_factory=list, max_length=2000)
    job_roles: list[Option] = Field(default_factory=list, max_length=2000)


class LeadMessageParseResponse(BaseModel):
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    resume_profile_id: Optional[str] = None
    candidate_id: Optional[str] = None
    job_role_name: Optional[str] = None
    job_role_exists: bool = False
    round: Optional[str] = None
    interviewer: Optional[str] = None
    interview_date: Optional[date] = None
    time_est: Optional[time] = None



class LeadUpdate(BaseModel):
    """Patch lead thread + earliest interview row (opportunity defaults)."""

    company_id: Optional[uuid.UUID] = None
    resume_profile_id: Optional[uuid.UUID] = None
    role: Optional[str] = Field(None, min_length=1, max_length=500)
    salary_range: Optional[str] = Field(None, max_length=255)
    bd_id: Optional[uuid.UUID] = None
    candidate_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Who entertains this lead; omit or null to clear.",
    )
    notes: Optional[str] = None
    bd_notes: Optional[str] = None
    arrived_on: Optional[date] = Field(None, description="Update the arrival date on the initial lead round")
    is_converted_override: Optional[bool] = None



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
    lead_arrival_date: Optional[date] = Field(
        default=None,
        description="When the lead arrived — stored on the root lead row (parent_interview_id is null). Independent of interview round dates.",
    )
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
    is_converted: bool = Field(default=False, description="Whether any round was converted.")
    is_converted_override: Optional[bool] = Field(default=None)
    lead_outcome: str = ""
    lead_status_label: str = ""
    lead_source: str = "derived"
    lead_notes: Optional[str] = None
    bd_notes: Optional[str] = None
    closed_sub_status: Optional[str] = None


class LeadListStats(BaseModel):
    """Aggregates for the current filter set (before pagination)."""

    total_leads: int
    in_pipeline: int
    active: int
    converted: int
    terminal: int
    other: int
    rejected: int
    dropped: int
    closed: int
    closed_won: int = 0
    closed_lost: int = 0
    dead: int


class LeadListPage(BaseModel):
    items: list[LeadListItem]
    total: int
    page: int
    page_size: int
    stats: LeadListStats

import uuid
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.interview import Interview
    from app.models.business_developer import BusinessDeveloper


class ResumeProfile(SQLModel, table=True):
    """Resume profiles used for applications (e.g., Ibrahim Jafri, Fahad Altaf)."""

    __tablename__ = "resume_profiles"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True, max_length=255)
    is_active: bool = Field(default=True)
    department_id: Optional[uuid.UUID] = Field(default=None, foreign_key="departments.id", index=True)
    bd_id: Optional[uuid.UUID] = Field(default=None, foreign_key="business_developers.id", index=True)
    linkedin_url: Optional[str] = Field(default=None, max_length=500)
    github_url: Optional[str] = Field(default=None, max_length=500)
    portfolio_url: Optional[str] = Field(default=None, max_length=1000)
    resume_url: Optional[str] = Field(default=None, max_length=1000)
    location: Optional[str] = Field(default=None, max_length=255)

    # ── Demographic details (used for interview prep / screening questions) ──
    dob: Optional[str] = Field(default=None, max_length=50)
    phone: Optional[str] = Field(default=None, max_length=30)
    address: Optional[str] = Field(default=None, max_length=500)
    zip_code: Optional[str] = Field(default=None, max_length=15)
    ssn_last4: Optional[str] = Field(default=None, max_length=4)
    nearby_locations: Optional[str] = Field(default=None, max_length=1000)
    visa_status: Optional[str] = Field(default=None, max_length=100)
    moved_to_us_year: Optional[int] = Field(default=None)
    greencard_or_citizenship_year: Optional[int] = Field(default=None)
    education_degree: Optional[str] = Field(default=None, max_length=500)
    education_start_year: Optional[int] = Field(default=None)
    education_end_year: Optional[int] = Field(default=None)

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    interviews: list["Interview"] = Relationship(
        back_populates="resume_profile")
    business_developer: Optional["BusinessDeveloper"] = Relationship()

import uuid
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.interview import Interview


class ResumeProfile(SQLModel, table=True):
    """Resume profiles used for applications (e.g., Ibrahim Jafri, Fahad Altaf)."""

    __tablename__ = "resume_profiles"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True, max_length=255)
    is_active: bool = Field(default=True)
    linkedin_url: Optional[str] = Field(default=None, max_length=500)
    github_url: Optional[str] = Field(default=None, max_length=500)
    resume_url: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    interviews: list["Interview"] = Relationship(
        back_populates="resume_profile")

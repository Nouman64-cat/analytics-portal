import uuid
import json
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, TYPE_CHECKING


if TYPE_CHECKING:
    from app.models.interview import Interview


class Candidate(SQLModel, table=True):
    """People who attend interviews (e.g., Nouman Ejaz, Abdul Rehman)."""

    __tablename__ = "candidates"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255, index=True)
    is_active: bool = Field(default=True)
    # Primary department FK — kept for backward compat with interviews/filters.
    # Automatically set to the first entry in department_ids on create/update.
    department_id: Optional[uuid.UUID] = Field(default=None, foreign_key="departments.id", index=True)
    # JSON list of department UUID strings — e.g. '["uuid1","uuid2"]'
    department_ids: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # Relationships
    interviews: list["Interview"] = Relationship(back_populates="candidate")

    def get_department_ids_list(self) -> list[str]:
        """Return department_ids as a Python list of UUID strings."""
        if not self.department_ids:
            # Fall back to legacy single department_id
            return [str(self.department_id)] if self.department_id else []
        try:
            return json.loads(self.department_ids)
        except (json.JSONDecodeError, TypeError):
            return [str(self.department_id)] if self.department_id else []

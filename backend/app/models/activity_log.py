import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class ActivityLog(SQLModel, table=True):
    """Read-only audit entries for user actions in the portal."""

    __tablename__ = "activity_logs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    actor_user_id: Optional[uuid.UUID] = Field(default=None, index=True)
    actor_email: str = Field(max_length=255, index=True)
    action: str = Field(max_length=100, index=True)  # e.g. create_interview
    entity_type: str = Field(max_length=100, index=True)  # interview/profile/company/bd
    entity_id: Optional[uuid.UUID] = Field(default=None, index=True)
    message: str = Field(max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


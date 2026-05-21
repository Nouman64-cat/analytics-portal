import uuid
import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class BusyDay(SQLModel, table=True):
    __tablename__ = "busy_days"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    date: datetime.date = Field(index=True)
    department_id: Optional[uuid.UUID] = Field(default=None, index=True)
    reason: str | None = Field(default=None, max_length=255)
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

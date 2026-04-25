import uuid
import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import SQLModel, Field


class BusyDay(SQLModel, table=True):
    __tablename__ = "busy_days"
    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_busy_day_per_user_date"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="users.id", index=True)
    date: datetime.date = Field(index=True)
    reason: str | None = Field(default=None, max_length=255)
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.utcnow)

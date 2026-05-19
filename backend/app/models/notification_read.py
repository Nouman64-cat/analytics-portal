import uuid
from datetime import datetime

from sqlalchemy import UniqueConstraint
from sqlmodel import SQLModel, Field


class NotificationRead(SQLModel, table=True):
    """Tracks which unresponsive-lead notifications each user has read.

    One row per (user_id, thread_id) pair — marked when the user explicitly
    reads or dismisses the notification.
    """

    __tablename__ = "notification_reads"
    __table_args__ = (
        UniqueConstraint("user_id", "thread_id", name="uq_notification_read_user_thread"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(index=True, foreign_key="users.id")
    thread_id: uuid.UUID = Field(index=True, foreign_key="lead_threads.thread_id")
    read_at: datetime = Field(default_factory=datetime.utcnow)

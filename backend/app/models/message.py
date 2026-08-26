import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, String, UniqueConstraint
from sqlmodel import SQLModel, Field


class MessageThreadKind(str, Enum):
    DM = "dm"
    GROUP = "group"
    CHANNEL = "channel"


class MessageThread(SQLModel, table=True):
    """A conversation: a 1:1 DM, a fixed-membership group, or a department-wide channel."""

    __tablename__ = "message_threads"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    kind: MessageThreadKind = Field(sa_column=Column(String(10), nullable=False))
    title: Optional[str] = Field(default=None, max_length=255)  # group name; unused for dm/channel
    department_id: Optional[uuid.UUID] = Field(default=None, foreign_key="departments.id", index=True)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MessageThreadParticipant(SQLModel, table=True):
    """Membership rows for dm/group threads. Channel threads have no participant rows —
    their membership is computed live from User.department_ids."""

    __tablename__ = "message_thread_participants"
    __table_args__ = (
        UniqueConstraint("thread_id", "user_id", name="uq_message_thread_participant"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    thread_id: uuid.UUID = Field(index=True, foreign_key="message_threads.id")
    user_id: uuid.UUID = Field(index=True, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Message(SQLModel, table=True):
    __tablename__ = "messages"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    thread_id: uuid.UUID = Field(index=True, foreign_key="message_threads.id")
    sender_id: uuid.UUID = Field(index=True, foreign_key="users.id")
    body: str
    # JSON list of user-id strings the sender explicitly @-tagged via the composer (not a
    # parse of the body text — the client sends exactly which contacts it inserted).
    mentioned_user_ids: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    edited_at: Optional[datetime] = Field(default=None)
    # Body/mentions are cleared in place when a message is deleted — `deleted_at` is the only
    # trace left, letting clients render a "Message deleted" placeholder at the right spot.
    deleted_at: Optional[datetime] = Field(default=None)


class MessageAttachment(SQLModel, table=True):
    """A file (image or PDF) attached to a message. The browser uploads the bytes straight
    to S3 via a presigned PUT before the message is sent — this row just records where it
    landed, so the server never touches attachment bytes."""

    __tablename__ = "message_attachments"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    message_id: uuid.UUID = Field(index=True, foreign_key="messages.id")
    s3_key: str
    filename: str = Field(max_length=255)
    content_type: str = Field(max_length=100)
    size_bytes: int = 0
    # Client-rendered page-1 preview (PDFs only) — a small JPEG generated in the browser via
    # PDF.js and uploaded the same way as the main file. Null if generation failed/skipped.
    thumbnail_s3_key: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MessageRead(SQLModel, table=True):
    """Per-user watermarks for a thread — one row per (user_id, thread_id).
    Unread count = messages in the thread newer than last_read_at (or all, if no row).
    `cleared_at` is the "clear chat for me" watermark: messages at or before it are hidden
    from this user's view of the thread (history, search, last-message preview) while
    staying fully intact for every other participant — a new message after clearing shows
    up again normally, same as WhatsApp's per-device clear.
    `removed_at` additionally hides the *thread itself* from this user's messages list —
    same "for me only" scope, and the same self-healing rule: a message sent after removal
    (by anyone, including the remover) brings the thread back into the list automatically."""

    __tablename__ = "message_reads"
    __table_args__ = (
        UniqueConstraint("user_id", "thread_id", name="uq_message_read_user_thread"),
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(index=True, foreign_key="users.id")
    thread_id: uuid.UUID = Field(index=True)  # no FK — mirrors NotificationRead.thread_id style
    last_read_at: datetime = Field(default_factory=datetime.utcnow)
    cleared_at: Optional[datetime] = Field(default=None)
    removed_at: Optional[datetime] = Field(default=None)

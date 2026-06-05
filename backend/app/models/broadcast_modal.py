import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class BroadcastModal(SQLModel, table=True):
    __tablename__ = "broadcast_modals"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    title: str = Field(max_length=300)
    body: str = Field(default="")
    is_published: bool = Field(default=False)
    # Customisation fields
    theme: str = Field(default="indigo", max_length=50)
    title_size: str = Field(default="md", max_length=10)
    modal_size: str = Field(default="md", max_length=10)
    icon: str = Field(default="Megaphone", max_length=50)
    text_align: str = Field(default="left", max_length=10)
    show_glow: bool = Field(default=False)
    animation: str = Field(default="zoom", max_length=20)
    image_url: Optional[str] = Field(default=None, max_length=1000)
    image_fit: str = Field(default="contain", max_length=10)
    effect: str = Field(default="none", max_length=20)
    badge_label: str = Field(default="Announcement", max_length=100)
    close_button_label: str = Field(default="Got it", max_length=100)
    created_by_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    published_at: Optional[datetime] = Field(default=None)

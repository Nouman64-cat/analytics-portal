import uuid
from datetime import datetime
from sqlmodel import SQLModel, Field
from typing import TYPE_CHECKING


class BusinessDeveloper(SQLModel, table=True):
    """Business developers who source interview opportunities."""

    __tablename__ = "business_developers"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True, max_length=255)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

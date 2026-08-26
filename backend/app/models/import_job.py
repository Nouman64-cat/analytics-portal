import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import SQLModel, Field


class ImportJob(SQLModel, table=True):
    """Tracks one async bulk-import run (e.g. the Interviews-page Excel import)."""

    __tablename__ = "import_jobs"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    status: str = Field(default="pending", max_length=20)  # pending|processing|completed|failed
    filename: str = Field(max_length=500)
    # JSON: {"AIML": "<department uuid>", "DevOps": "<uuid>", "Data": "<uuid>"}
    department_mapping: Optional[str] = Field(default=None, sa_column=Column(Text))
    total_rows: int = Field(default=0)
    processed_rows: int = Field(default=0)
    imported_count: int = Field(default=0)
    updated_count: int = Field(default=0)
    skipped_count: int = Field(default=0)
    error_count: int = Field(default=0)
    # JSON list of {"sheet": str, "row": int, "level": "skipped"|"error", "reason": str}
    results: Optional[str] = Field(default=None, sa_column=Column(Text))
    # JSON: entity-creation counters, e.g. {"companies_created": N, ...}
    summary: Optional[str] = Field(default=None, sa_column=Column(Text))
    error_message: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_by_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = Field(default=None)

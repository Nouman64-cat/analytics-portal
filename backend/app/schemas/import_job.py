from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel


class ImportJobRead(BaseModel):
    id: UUID
    status: str
    filename: str
    total_rows: int
    processed_rows: int
    imported_count: int
    updated_count: int
    skipped_count: int
    error_count: int
    results: list[dict[str, Any]] = []
    summary: dict[str, Any] = {}
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

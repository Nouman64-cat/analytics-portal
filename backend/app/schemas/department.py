from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class DepartmentCreate(BaseModel):
    name: str
    slug: str


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    is_active: Optional[bool] = None


class DepartmentRead(BaseModel):
    id: UUID
    name: str
    slug: str
    is_active: bool
    created_at: datetime
    user_count: int = 0

    class Config:
        from_attributes = True

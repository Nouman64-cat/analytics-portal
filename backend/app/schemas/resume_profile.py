import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class ResumeProfileCreate(BaseModel):
    name: str
    is_active: bool = True


class ResumeProfileUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class ResumeProfileRead(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}

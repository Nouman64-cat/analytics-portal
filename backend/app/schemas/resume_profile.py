import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class ResumeProfileCreate(BaseModel):
    name: str


class ResumeProfileUpdate(BaseModel):
    name: Optional[str] = None


class ResumeProfileRead(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

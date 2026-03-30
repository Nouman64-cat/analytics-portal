import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class BusinessDeveloperCreate(BaseModel):
    name: str


class BusinessDeveloperUpdate(BaseModel):
    name: Optional[str] = None


class BusinessDeveloperRead(BaseModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

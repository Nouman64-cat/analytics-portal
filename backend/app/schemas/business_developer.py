import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class BusinessDeveloperCreate(BaseModel):
    name: str
    email: Optional[str] = None


class BusinessDeveloperUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None


class BusinessDeveloperRead(BaseModel):
    id: uuid.UUID
    name: str
    email: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

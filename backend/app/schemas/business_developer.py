import json
import uuid
from datetime import datetime
from pydantic import BaseModel, field_validator
from typing import Optional


class BusinessDeveloperCreate(BaseModel):
    name: str
    email: Optional[str] = None
    department_ids: Optional[list[str]] = None


class BusinessDeveloperUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    department_ids: Optional[list[str]] = None


class BusinessDeveloperRead(BaseModel):
    id: uuid.UUID
    name: str
    email: Optional[str] = None
    is_active: bool
    department_ids: Optional[list[str]] = None
    created_at: datetime
    updated_at: datetime

    @field_validator("department_ids", mode="before")
    @classmethod
    def _parse_department_ids(cls, v):
        if v is None or isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return None
        return None

    model_config = {"from_attributes": True}

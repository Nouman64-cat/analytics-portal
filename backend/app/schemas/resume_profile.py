import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class ResumeProfileCreate(BaseModel):
    name: str
    is_active: bool = True
    department_id: Optional[uuid.UUID] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    resume_url: Optional[str] = None


class ResumeProfileUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    department_id: Optional[uuid.UUID] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    resume_url: Optional[str] = None


class ResumeProfileRead(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    department_id: Optional[uuid.UUID] = None
    department_name: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    resume_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

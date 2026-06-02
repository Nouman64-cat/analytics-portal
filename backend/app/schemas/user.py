import json
from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator
from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole


class UserCreate(UserBase):
    department_id: Optional[UUID] = None
    allowed_dept_ids: Optional[list[str]] = None
    bd_entity_id: Optional[UUID] = None
    team_lead_user_id: Optional[UUID] = None


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    department_id: Optional[UUID] = None
    allowed_dept_ids: Optional[list[str]] = None
    bd_entity_id: Optional[UUID] = None
    team_lead_user_id: Optional[UUID] = None


class UserRead(UserBase):
    id: UUID
    department_id: Optional[UUID] = None
    allowed_dept_ids: Optional[list[str]] = None
    bd_entity_id: Optional[UUID] = None
    team_lead_user_id: Optional[UUID] = None
    must_change_password: bool
    alarm_enabled: bool
    accent_color: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_validator("allowed_dept_ids", mode="before")
    @classmethod
    def _parse_allowed_dept_ids(cls, v):
        if v is None or isinstance(v, list):
            return v
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return None
        return None

    class Config:
        from_attributes = True


class UserSettingsUpdate(BaseModel):
    alarm_enabled: bool
    accent_color: Optional[str] = None


class UserMeRead(UserRead):
    """GET /auth/me — includes linked candidate id for team-member accounts (email match)."""

    candidate_id: Optional[UUID] = None

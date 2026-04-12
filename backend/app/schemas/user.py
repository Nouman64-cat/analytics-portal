from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr
from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole


class UserCreate(UserBase):
    pass


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[UserRole] = None


class UserRead(UserBase):
    id: UUID
    must_change_password: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserMeRead(UserRead):
    """GET /auth/me — includes linked candidate id for team-member accounts (email match)."""

    candidate_id: Optional[UUID] = None

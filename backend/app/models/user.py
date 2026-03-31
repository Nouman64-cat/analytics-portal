import uuid
from datetime import datetime
from sqlmodel import SQLModel, Field
from enum import Enum


class UserRole(str, Enum):
    BD = "bd"
    MANAGER = "manager"
    TEAM_MEMBER = "team-member"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    role: UserRole = Field(default=UserRole.TEAM_MEMBER)
    must_change_password: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

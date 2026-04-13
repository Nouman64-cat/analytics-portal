import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Column
from sqlalchemy import Enum as SAEnum
from sqlmodel import SQLModel, Field


class UserRole(str, Enum):
    SUPERADMIN = "superadmin"
    BD = "bd"
    MANAGER = "manager"
    TEAM_MEMBER = "team-member"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    full_name: str = Field(default="User")
    hashed_password: str
    # VARCHAR + check, not PostgreSQL CREATE TYPE — avoids DDL/search_path bugs on new schemas
    role: UserRole = Field(
        default=UserRole.TEAM_MEMBER,
        sa_column=Column(
            SAEnum(
                UserRole,
                native_enum=False,
                values_callable=lambda cls: [m.value for m in cls],
            ),
            nullable=False,
        ),
    )
    must_change_password: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

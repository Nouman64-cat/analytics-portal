import json
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, String, TypeDecorator
from sqlmodel import SQLModel, Field


class UserRole(str, Enum):
    SUPERADMIN = "superadmin"
    BD = "bd"
    MANAGER = "manager"
    TEAM_MEMBER = "team-member"
    DEPT_LEAD = "dept-lead"
    BD_TEAM_LEAD = "bd-team-lead"
    BD_MANAGER = "bd-manager"
    GUEST = "guest"
    TECH_STACK_MANAGER = "tech-stack-manager"
    COORDINATOR = "coordinator"


class UserRoleColumn(TypeDecorator):
    """VARCHAR in DB; accepts legacy PostgreSQL enum labels (e.g. SUPERADMIN) on read."""

    impl = String(32)
    cache_ok = True

    _LEGACY_PG = {
        "SUPERADMIN": UserRole.SUPERADMIN,
        "BD": UserRole.BD,
        "MANAGER": UserRole.MANAGER,
        "TEAM_MEMBER": UserRole.TEAM_MEMBER,
        "DEPT_LEAD": UserRole.DEPT_LEAD,
        "BD_TEAM_LEAD": UserRole.BD_TEAM_LEAD,
        "BD_MANAGER": UserRole.BD_MANAGER,
        "GUEST": UserRole.GUEST,
    }

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, UserRole):
            return value.value
        return self._to_role(value).value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return self._to_role(value)

    @classmethod
    def _to_role(cls, raw) -> UserRole:
        if isinstance(raw, UserRole):
            return raw
        s = raw if isinstance(raw, str) else str(raw)
        try:
            return UserRole(s)
        except ValueError:
            pass
        if s in cls._LEGACY_PG:
            return cls._LEGACY_PG[s]
        u = s.upper()
        if u in cls._LEGACY_PG:
            return cls._LEGACY_PG[u]
        raise ValueError(f"Invalid user role: {raw!r}")


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    email: str = Field(unique=True, index=True)
    full_name: str = Field(default="User")
    hashed_password: str
    role: UserRole = Field(
        default=UserRole.TEAM_MEMBER,
        sa_column=Column(UserRoleColumn(), nullable=False),
    )
    is_active: bool = Field(default=True)
    must_change_password: bool = Field(default=True)
    alarm_enabled: bool = Field(default=False)
    alarm_sound: Optional[str] = Field(default=None, max_length=30)
    alarm_style: Optional[str] = Field(default=None, max_length=20)
    accent_color: Optional[str] = Field(default=None, max_length=20)
    glassmorphism_enabled: bool = Field(default=False)
    department_id: Optional[uuid.UUID] = Field(default=None, foreign_key="departments.id", index=True)
    allowed_dept_ids: Optional[str] = Field(default=None)  # JSON list of UUID strings; [] = all; null = role default
    # JSON list of department UUID strings, e.g. '["uuid1","uuid2"]' — source of truth for
    # messaging scope (internal team messaging). Falls back to the legacy single
    # department_id when unset.
    department_ids: Optional[str] = Field(default=None)
    created_by: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id", index=True)
    bd_entity_id: Optional[uuid.UUID] = Field(default=None, foreign_key="business_developers.id", index=True)
    team_lead_user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id", index=True)
    can_broadcast: bool = Field(default=False)
    reset_token: Optional[str] = Field(default=None)
    reset_token_expires_at: Optional[datetime] = Field(default=None)
    # Jarvis AI access (non-superadmin roles only — superadmin always has full access).
    # A trial can only ever be granted once per user; re-activating a subscription simply
    # resets jarvis_access_until to 30 days out, it does not stack.
    jarvis_trial_used: bool = Field(default=False)
    jarvis_access_until: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def get_department_ids_list(self) -> list[str]:
        """Return department_ids as a Python list of UUID strings."""
        if not self.department_ids:
            return [str(self.department_id)] if self.department_id else []
        try:
            return json.loads(self.department_ids)
        except (json.JSONDecodeError, TypeError):
            return [str(self.department_id)] if self.department_id else []

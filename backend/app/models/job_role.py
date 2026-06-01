import uuid
from datetime import datetime
from sqlmodel import SQLModel, Field


class JobRole(SQLModel, table=True):
    __tablename__ = "job_roles"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=300, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

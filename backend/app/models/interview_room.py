import uuid
from datetime import datetime
from sqlmodel import SQLModel, Field


class InterviewRoom(SQLModel, table=True):
    __tablename__ = "interview_rooms"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    room_no: str = Field(max_length=50, unique=True, index=True)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class InterviewRoomCreate(BaseModel):
    room_no: str


class InterviewRoomUpdate(BaseModel):
    room_no: Optional[str] = None
    is_active: Optional[bool] = None


class InterviewRoomRead(BaseModel):
    id: UUID
    room_no: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

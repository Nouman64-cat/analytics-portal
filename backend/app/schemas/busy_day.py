import uuid
import datetime
from typing import Optional
from pydantic import BaseModel


class BusyDayCreate(BaseModel):
    date: datetime.date
    reason: Optional[str] = None
    user_id: Optional[uuid.UUID] = None  # superadmin only; defaults to current user


class BusyDayRead(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    date: datetime.date
    reason: Optional[str] = None
    created_at: datetime.datetime

    class Config:
        from_attributes = True

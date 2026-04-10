import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ActivityLogRead(BaseModel):
    id: uuid.UUID
    actor_user_id: Optional[uuid.UUID]
    actor_email: str
    action: str
    entity_type: str
    entity_id: Optional[uuid.UUID]
    message: str
    created_at: datetime


class ActivityLogPage(BaseModel):
    items: list[ActivityLogRead]
    total: int
    limit: int
    offset: int


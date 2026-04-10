from __future__ import annotations

import uuid
from typing import Optional

from sqlmodel import Session

from app.models.activity_log import ActivityLog
from app.models.user import User


def record_activity(
    session: Session,
    *,
    actor: Optional[User],
    action: str,
    entity_type: str,
    entity_id: Optional[uuid.UUID],
    message: str,
) -> None:
    """Append an audit entry and commit it in the current unit of work."""
    session.add(
        ActivityLog(
            actor_user_id=actor.id if actor else None,
            actor_email=actor.email if actor and actor.email else "unknown",
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            message=message,
        )
    )


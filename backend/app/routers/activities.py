from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, func

from app.database import get_session
from app.deps import get_current_user
from app.models.activity_log import ActivityLog
from app.schemas.activity import ActivityLogPage

router = APIRouter(
    prefix="/api/v1/activities",
    tags=["Activities"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/", response_model=ActivityLogPage)
def list_activities(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
):
    """Read-only paginated activity feed (latest first)."""
    total = session.exec(select(func.count(ActivityLog.id))).one()
    items = session.exec(
        select(ActivityLog)
        .order_by(ActivityLog.created_at.desc())  # type: ignore
        .offset(offset)
        .limit(limit)
    ).all()
    return ActivityLogPage(items=items, total=total, limit=limit, offset=offset)


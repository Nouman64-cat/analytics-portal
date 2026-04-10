from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlmodel import Session, select, func

from app.database import get_session
from app.deps import get_current_user
from app.models.activity_log import ActivityLog
from app.models.user import User, UserRole
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
    current_user: User = Depends(get_current_user),
):
    """Read-only paginated activity feed (latest first)."""
    if current_user.role in {UserRole.MANAGER, UserRole.BD}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to activities",
        )

    total = session.exec(select(func.count(ActivityLog.id))).one()
    items = session.exec(
        select(ActivityLog)
        .order_by(ActivityLog.created_at.desc())  # type: ignore
        .offset(offset)
        .limit(limit)
    ).all()
    return ActivityLogPage(items=items, total=total, limit=limit, offset=offset)


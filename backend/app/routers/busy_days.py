import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.models.busy_day import BusyDay
from app.models.user import User, UserRole
from app.schemas.busy_day import BusyDayCreate, BusyDayRead

router = APIRouter(
    prefix="/api/v1/busy-days",
    tags=["Busy Days"],
    dependencies=[Depends(get_current_user)],
)

_CAN_WRITE_ROLES = {UserRole.SUPERADMIN, UserRole.TEAM_MEMBER}


def _assert_can_write(user: User) -> None:
    if user.role not in _CAN_WRITE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only team members and superadmins can manage busy days",
        )


def _to_read(busy_day: BusyDay, user_name: str) -> BusyDayRead:
    return BusyDayRead(
        id=busy_day.id,
        user_id=busy_day.user_id,
        user_name=user_name,
        date=busy_day.date,
        reason=busy_day.reason,
        created_at=busy_day.created_at,
    )


@router.get("/", response_model=List[BusyDayRead])
def list_busy_days(
    user_id: Optional[uuid.UUID] = Query(None, description="Filter by user (superadmin only)"),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    # All authenticated users can read busy days.
    # Superadmin/BD/Manager see everyone's; team-member sees only their own.
    stmt = select(BusyDay)
    if current_user.role == UserRole.TEAM_MEMBER:
        stmt = stmt.where(BusyDay.user_id == current_user.id)
    elif user_id and current_user.role == UserRole.SUPERADMIN:
        stmt = stmt.where(BusyDay.user_id == user_id)

    busy_days = session.exec(stmt.order_by(BusyDay.date)).all()

    user_name_cache: dict[uuid.UUID, str] = {}
    result: List[BusyDayRead] = []
    for bd in busy_days:
        if bd.user_id not in user_name_cache:
            u = session.get(User, bd.user_id)
            user_name_cache[bd.user_id] = u.full_name if u else "Unknown"
        result.append(_to_read(bd, user_name_cache[bd.user_id]))
    return result


@router.post("/", response_model=BusyDayRead, status_code=status.HTTP_201_CREATED)
def create_busy_day(
    data: BusyDayCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _assert_can_write(current_user)

    if data.user_id and current_user.role == UserRole.SUPERADMIN:
        target_user_id = data.user_id
        target_user = session.get(User, target_user_id)
        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    else:
        target_user_id = current_user.id
        target_user = current_user

    existing = session.exec(
        select(BusyDay).where(
            BusyDay.user_id == target_user_id,
            BusyDay.date == data.date,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This day is already marked as busy for that user",
        )

    busy_day = BusyDay(
        user_id=target_user_id,
        date=data.date,
        reason=data.reason or None,
    )
    session.add(busy_day)
    session.commit()
    session.refresh(busy_day)
    return _to_read(busy_day, target_user.full_name)


@router.delete("/{busy_day_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_busy_day(
    busy_day_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _assert_can_write(current_user)

    busy_day = session.get(BusyDay, busy_day_id)
    if not busy_day:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Busy day not found")

    if current_user.role != UserRole.SUPERADMIN and busy_day.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only remove your own busy markers",
        )

    session.delete(busy_day)
    session.commit()
    return None

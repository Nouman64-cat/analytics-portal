from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.models.interview_room import InterviewRoom
from app.models.user import User, UserRole
from app.schemas.interview_room import InterviewRoomCreate, InterviewRoomRead, InterviewRoomUpdate

router = APIRouter(
    prefix="/api/v1/interview-rooms",
    tags=["Interview Rooms"],
    dependencies=[Depends(get_current_user)],
)

# Roles allowed to create/update/deactivate interview rooms. A coordinator's job
# is assigning rooms to interviews, which includes keeping the room list current.
_ROOM_MANAGE_ROLES = (UserRole.SUPERADMIN, UserRole.COORDINATOR)


def _require_room_manage_role(current_user: User) -> None:
    if current_user.role not in _ROOM_MANAGE_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only superadmins and coordinators can manage interview rooms",
        )


@router.get("/", response_model=List[InterviewRoomRead])
def list_interview_rooms(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List all interview rooms. Any authenticated user may call this (needed for the room picker on the interview form)."""
    rooms = session.exec(select(InterviewRoom).order_by(InterviewRoom.room_no)).all()
    return rooms


@router.post("/", response_model=InterviewRoomRead, status_code=status.HTTP_201_CREATED)
def create_interview_room(
    data: InterviewRoomCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new interview room. Superadmin or coordinator."""
    _require_room_manage_role(current_user)

    room_no = data.room_no.strip()
    if not room_no:
        raise HTTPException(status_code=400, detail="Room number is required")
    existing = session.exec(
        select(InterviewRoom).where(InterviewRoom.room_no == room_no)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A room with this number already exists")

    room = InterviewRoom(room_no=room_no)
    session.add(room)
    session.commit()
    session.refresh(room)
    return room


@router.patch("/{room_id}", response_model=InterviewRoomRead)
def update_interview_room(
    room_id: UUID,
    data: InterviewRoomUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update a room's number or active status. Superadmin or coordinator."""
    _require_room_manage_role(current_user)

    room = session.get(InterviewRoom, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Interview room not found")

    update_data = data.model_dump(exclude_unset=True)
    if "room_no" in update_data:
        room_no = (update_data["room_no"] or "").strip()
        if not room_no:
            raise HTTPException(status_code=400, detail="Room number is required")
        existing = session.exec(
            select(InterviewRoom).where(InterviewRoom.room_no == room_no, InterviewRoom.id != room_id)
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="A room with this number already exists")
        update_data["room_no"] = room_no

    for key, value in update_data.items():
        setattr(room, key, value)

    session.add(room)
    session.commit()
    session.refresh(room)
    return room


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_interview_room(
    room_id: UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a room (sets is_active=False). Superadmin or coordinator."""
    _require_room_manage_role(current_user)

    room = session.get(InterviewRoom, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Interview room not found")

    room.is_active = False
    session.add(room)
    session.commit()

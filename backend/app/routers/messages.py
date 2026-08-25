"""Internal team messaging: department-scoped DMs, groups, and department channels."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections import defaultdict
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select
from starlette.concurrency import run_in_threadpool

from app.config import get_settings
from app.database import engine, get_session
from app.deps import get_current_user
from app.messaging_utils import (
    can_access_channel,
    can_dm,
    can_form_group,
    get_or_create_channel_thread,
    get_or_create_dm_thread,
    user_department_scope_ids,
)
from app.models.department import Department
from app.models.message import (
    Message,
    MessageRead,
    MessageThread,
    MessageThreadKind,
    MessageThreadParticipant,
)
from app.models.user import User, UserRole
from app.ws_manager import manager

router = APIRouter(
    prefix="/api/v1/messages",
    tags=["Messages"],
    dependencies=[Depends(get_current_user)],
)

# Separate router for the WebSocket route: it can't carry the HTTP-only
# `Depends(get_current_user)` (HTTPBearer) applied to `router` above — the WS handshake
# has no Authorization header, so it authenticates itself via a first-message token instead.
ws_router = APIRouter(prefix="/api/v1/messages", tags=["Messages"])

MAX_MESSAGE_LENGTH = 4000


class ContactOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str


class MessageOut(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    sender_id: uuid.UUID
    sender_name: str
    body: str
    # Contacts the sender explicitly @-tagged via the composer — used by clients to render
    # mentions in a distinct color and to notify a mentioned user.
    mentions: list[ContactOut] = []
    created_at: datetime
    edited_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class ThreadSummaryOut(BaseModel):
    id: uuid.UUID
    kind: MessageThreadKind
    title: str
    department_id: Optional[uuid.UUID] = None
    other_user: Optional[ContactOut] = None
    last_message: Optional[MessageOut] = None
    unread_count: int
    updated_at: datetime


class UnreadCountOut(BaseModel):
    unread_count: int


class SendMessageRequest(BaseModel):
    body: str
    mentioned_user_ids: list[uuid.UUID] = []


class CreateGroupRequest(BaseModel):
    title: str
    participant_user_ids: list[uuid.UUID]


class EditMessageRequest(BaseModel):
    body: str


def _user_map(session: Session, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, User]:
    ids = list({uid for uid in user_ids if uid})
    if not ids:
        return {}
    return {u.id: u for u in session.exec(select(User).where(User.id.in_(ids))).all()}


def _contact_out(u: User) -> ContactOut:
    return ContactOut(id=u.id, full_name=u.full_name, email=u.email, role=u.role.value)


def _parse_mention_ids(raw: Optional[str]) -> list[uuid.UUID]:
    if not raw:
        return []
    try:
        return [uuid.UUID(s) for s in json.loads(raw)]
    except (json.JSONDecodeError, TypeError, ValueError):
        return []


def _message_out(m: Message, people: dict[uuid.UUID, User]) -> MessageOut:
    sender = people.get(m.sender_id)
    mentions = [_contact_out(people[uid]) for uid in _parse_mention_ids(m.mentioned_user_ids) if uid in people]
    return MessageOut(
        id=m.id,
        thread_id=m.thread_id,
        sender_id=m.sender_id,
        sender_name=sender.full_name if sender else "Unknown",
        body=m.body,
        mentions=mentions,
        created_at=m.created_at,
        edited_at=m.edited_at,
        deleted_at=m.deleted_at,
    )


def _authorize_thread(session: Session, current_user: User, thread_id: uuid.UUID) -> MessageThread:
    thread = session.get(MessageThread, thread_id)
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")
    if thread.kind == MessageThreadKind.CHANNEL:
        if not can_access_channel(current_user, thread.department_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this department")
        return thread
    if current_user.role == UserRole.SUPERADMIN:
        return thread
    is_participant = session.exec(
        select(MessageThreadParticipant).where(
            MessageThreadParticipant.thread_id == thread_id,
            MessageThreadParticipant.user_id == current_user.id,
        )
    ).first()
    if not is_participant:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant of this thread")
    return thread


def _my_threads(session: Session, current_user: User) -> list[MessageThread]:
    """Every thread visible to me — my DM/group threads, plus every department channel in
    my scope (lazily ensuring those channel rows exist first)."""
    dept_ids = user_department_scope_ids(current_user, session)
    for did in dept_ids:
        get_or_create_channel_thread(session, did)

    participant_rows = session.exec(
        select(MessageThreadParticipant).where(MessageThreadParticipant.user_id == current_user.id)
    ).all()
    dm_group_ids = [p.thread_id for p in participant_rows]

    channel_threads = (
        session.exec(
            select(MessageThread).where(
                MessageThread.kind == MessageThreadKind.CHANNEL,
                MessageThread.department_id.in_(dept_ids),
            )
        ).all()
        if dept_ids
        else []
    )
    dm_group_threads = (
        session.exec(select(MessageThread).where(MessageThread.id.in_(dm_group_ids))).all()
        if dm_group_ids
        else []
    )
    return channel_threads + dm_group_threads


def _build_thread_summaries(session: Session, current_user: User) -> list[ThreadSummaryOut]:
    all_threads = _my_threads(session, current_user)
    if not all_threads:
        return []
    thread_ids = [t.id for t in all_threads]
    channel_threads = [t for t in all_threads if t.kind == MessageThreadKind.CHANNEL]

    messages = session.exec(
        select(Message).where(Message.thread_id.in_(thread_ids)).order_by(Message.created_at.desc())
    ).all()
    last_message_by_thread: dict[uuid.UUID, Message] = {}
    for m in messages:
        if m.thread_id not in last_message_by_thread:
            last_message_by_thread[m.thread_id] = m

    read_rows = session.exec(
        select(MessageRead).where(
            MessageRead.user_id == current_user.id, MessageRead.thread_id.in_(thread_ids)
        )
    ).all()
    last_read_by_thread = {r.thread_id: r.last_read_at for r in read_rows}

    unread_counts: dict[uuid.UUID, int] = defaultdict(int)
    for m in messages:
        if m.sender_id == current_user.id:
            continue
        last_read = last_read_by_thread.get(m.thread_id)
        if last_read is None or m.created_at > last_read:
            unread_counts[m.thread_id] += 1

    dm_thread_ids = [t.id for t in all_threads if t.kind == MessageThreadKind.DM]
    other_rows = (
        session.exec(
            select(MessageThreadParticipant).where(
                MessageThreadParticipant.thread_id.in_(dm_thread_ids),
                MessageThreadParticipant.user_id != current_user.id,
            )
        ).all()
        if dm_thread_ids
        else []
    )
    other_user_id_by_thread = {r.thread_id: r.user_id for r in other_rows}

    sender_ids = [m.sender_id for m in last_message_by_thread.values()]
    people = _user_map(session, list(other_user_id_by_thread.values()) + sender_ids)

    dept_map = (
        {
            d.id: d
            for d in session.exec(
                select(Department).where(
                    Department.id.in_([t.department_id for t in channel_threads])
                )
            ).all()
        }
        if channel_threads
        else {}
    )

    results: list[ThreadSummaryOut] = []
    for t in all_threads:
        other_user: Optional[ContactOut] = None
        if t.kind == MessageThreadKind.CHANNEL:
            dept = dept_map.get(t.department_id)
            title = dept.name if dept else "Department"
        elif t.kind == MessageThreadKind.DM:
            other_id = other_user_id_by_thread.get(t.id)
            other = people.get(other_id) if other_id else None
            title = other.full_name if other else "Direct message"
            other_user = _contact_out(other) if other else None
        else:  # GROUP
            title = t.title or "Group"

        last_msg = last_message_by_thread.get(t.id)
        last_message_out = _message_out(last_msg, people) if last_msg else None

        results.append(
            ThreadSummaryOut(
                id=t.id,
                kind=t.kind,
                title=title,
                department_id=t.department_id,
                other_user=other_user,
                last_message=last_message_out,
                unread_count=unread_counts.get(t.id, 0),
                updated_at=last_msg.created_at if last_msg else t.created_at,
            )
        )

    results.sort(key=lambda r: r.updated_at, reverse=True)
    return results


@router.get("/contacts", response_model=list[ContactOut])
def list_contacts(
    q: Optional[str] = None,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ContactOut]:
    """Users the caller is allowed to DM or add to a group."""
    users = session.exec(
        select(User).where(User.is_active == True, User.id != current_user.id)  # noqa: E712
    ).all()
    eligible = [u for u in users if can_dm(current_user, u)]
    if q and q.strip():
        needle = q.strip().lower()
        eligible = [
            u for u in eligible if needle in u.full_name.lower() or needle in u.email.lower()
        ]
    eligible.sort(key=lambda u: u.full_name.lower())
    return [_contact_out(u) for u in eligible]


@router.get("/threads", response_model=list[ThreadSummaryOut])
def list_threads(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[ThreadSummaryOut]:
    """All threads visible to me: my DMs/groups, plus every department channel in my scope."""
    return _build_thread_summaries(session, current_user)


@router.get("/unread-count", response_model=UnreadCountOut)
def get_unread_count(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> UnreadCountOut:
    """Cheap variant of the unread total in `_build_thread_summaries` — N small indexed
    COUNT queries instead of loading every message body in every visible thread. This is
    the most frequently-polled endpoint of the three, so it's worth keeping lightweight."""
    thread_ids = [t.id for t in _my_threads(session, current_user)]
    if not thread_ids:
        return UnreadCountOut(unread_count=0)

    read_rows = session.exec(
        select(MessageRead).where(
            MessageRead.user_id == current_user.id, MessageRead.thread_id.in_(thread_ids)
        )
    ).all()
    last_read_by_thread = {r.thread_id: r.last_read_at for r in read_rows}

    total = 0
    for tid in thread_ids:
        stmt = select(func.count()).select_from(Message).where(
            Message.thread_id == tid, Message.sender_id != current_user.id
        )
        last_read = last_read_by_thread.get(tid)
        if last_read is not None:
            stmt = stmt.where(Message.created_at > last_read)
        total += session.exec(stmt).one()

    return UnreadCountOut(unread_count=total)


@router.post("/threads/dm/{user_id}", response_model=ThreadSummaryOut)
def open_dm(
    user_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ThreadSummaryOut:
    """Get-or-create the 1:1 thread with `user_id`."""
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot message yourself")
    target = session.get(User, user_id)
    if not target or not target.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not can_dm(current_user, target):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You don't share a department with this user"
        )

    thread = get_or_create_dm_thread(session, current_user.id, target.id)
    return ThreadSummaryOut(
        id=thread.id,
        kind=thread.kind,
        title=target.full_name,
        other_user=_contact_out(target),
        unread_count=0,
        updated_at=thread.created_at,
    )


@router.post("/threads/group", response_model=ThreadSummaryOut)
def create_group(
    payload: CreateGroupRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> ThreadSummaryOut:
    """Create a fixed-membership group thread. Members must all share a department."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group name is required")

    participant_ids = {uid for uid in payload.participant_user_ids if uid != current_user.id}
    if len(participant_ids) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="A group needs at least 2 other members"
        )

    members = session.exec(
        select(User).where(User.id.in_(participant_ids), User.is_active == True)  # noqa: E712
    ).all()
    if len(members) != len(participant_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more users not found")

    if not can_form_group(members + [current_user]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="All group members must share at least one department",
        )

    thread = MessageThread(kind=MessageThreadKind.GROUP, title=title, created_by=current_user.id)
    session.add(thread)
    session.flush()
    session.add(MessageThreadParticipant(thread_id=thread.id, user_id=current_user.id))
    for m in members:
        session.add(MessageThreadParticipant(thread_id=thread.id, user_id=m.id))
    session.commit()
    session.refresh(thread)

    return ThreadSummaryOut(
        id=thread.id,
        kind=thread.kind,
        title=title,
        unread_count=0,
        updated_at=thread.created_at,
    )


@router.get("/threads/{thread_id}/messages", response_model=list[MessageOut])
def get_thread_messages(
    thread_id: uuid.UUID,
    before: Optional[datetime] = None,
    around: Optional[uuid.UUID] = None,
    limit: int = 50,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[MessageOut]:
    """Cursor-paginated history, newest-first internally, returned oldest-first for display.
    Pass `around` (a message id, e.g. from a search result) instead of `before` to fetch a
    window of context centered on that message rather than the most recent page."""
    _authorize_thread(session, current_user, thread_id)
    limit = max(1, min(limit, 100))

    if around:
        target = session.get(Message, around)
        if not target or target.thread_id != thread_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        half = max(1, limit // 2)
        older = session.exec(
            select(Message)
            .where(Message.thread_id == thread_id, Message.created_at < target.created_at)
            .order_by(Message.created_at.desc())
            .limit(half)
        ).all()
        newer = session.exec(
            select(Message)
            .where(Message.thread_id == thread_id, Message.created_at > target.created_at)
            .order_by(Message.created_at.asc())
            .limit(half)
        ).all()
        rows = list(reversed(newer)) + [target] + older  # descending order, matches the branch below
    else:
        stmt = select(Message).where(Message.thread_id == thread_id)
        if before:
            stmt = stmt.where(Message.created_at < before)
        stmt = stmt.order_by(Message.created_at.desc()).limit(limit)
        rows = session.exec(stmt).all()

    people = _user_map(
        session, [m.sender_id for m in rows] + [uid for m in rows for uid in _parse_mention_ids(m.mentioned_user_ids)]
    )
    out = [_message_out(m, people) for m in rows]
    out.reverse()
    return out


def _escape_like(needle: str) -> str:
    """Escape LIKE/ILIKE wildcards so a literal '%' or '_' in the search text is matched
    literally instead of acting as a wildcard."""
    return needle.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/threads/{thread_id}/search", response_model=list[MessageOut])
def search_thread_messages(
    thread_id: uuid.UUID,
    q: str = "",
    limit: int = 30,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> list[MessageOut]:
    """Search this thread's message history by body text. Newest match first."""
    _authorize_thread(session, current_user, thread_id)
    needle = q.strip()
    if not needle:
        return []
    limit = max(1, min(limit, 50))

    stmt = (
        select(Message)
        .where(Message.thread_id == thread_id, Message.body.ilike(f"%{_escape_like(needle)}%", escape="\\"))
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    rows = session.exec(stmt).all()

    people = _user_map(
        session, [m.sender_id for m in rows] + [uid for m in rows for uid in _parse_mention_ids(m.mentioned_user_ids)]
    )
    return [_message_out(m, people) for m in rows]


MAX_MENTIONS_PER_MESSAGE = 20


def _recipients_for_thread(session: Session, thread: MessageThread, thread_id: uuid.UUID) -> set[uuid.UUID]:
    """Who should receive a WS push for an event in this thread — every connected member of
    the department for a channel, or every participant (including the actor, so their other
    open tabs/devices stay in sync) for a dm/group."""
    if thread.kind == MessageThreadKind.CHANNEL:
        return manager.connected_users_in_department(thread.department_id)
    return {
        p.user_id
        for p in session.exec(
            select(MessageThreadParticipant).where(MessageThreadParticipant.thread_id == thread_id)
        ).all()
    }


def _send_message_sync(
    session: Session, thread_id: uuid.UUID, current_user: User, body: str, mentioned_user_ids: list[uuid.UUID]
) -> tuple[MessageOut, set[uuid.UUID]]:
    """All the synchronous DB work for sending a message. Run via `run_in_threadpool` so it
    never blocks the event loop — this app runs as a single uvicorn process with no worker
    pool, so a blocking call here would stall every other request (interviews, leads,
    everything), not just messaging, for its duration."""
    thread = _authorize_thread(session, current_user, thread_id)
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body is required")
    if len(body) > MAX_MESSAGE_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Message too long (max {MAX_MESSAGE_LENGTH} characters)",
        )

    mention_ids = list(dict.fromkeys(uid for uid in mentioned_user_ids if uid != current_user.id))[
        :MAX_MENTIONS_PER_MESSAGE
    ]
    message = Message(
        thread_id=thread_id,
        sender_id=current_user.id,
        body=body,
        mentioned_user_ids=json.dumps([str(uid) for uid in mention_ids]) if mention_ids else None,
    )
    session.add(message)
    session.commit()
    session.refresh(message)

    people = _user_map(session, mention_ids)
    people[current_user.id] = current_user
    out = _message_out(message, people)
    return out, _recipients_for_thread(session, thread, thread_id)


@router.post("/threads/{thread_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def send_message(
    thread_id: uuid.UUID,
    payload: SendMessageRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MessageOut:
    out, recipient_ids = await run_in_threadpool(
        _send_message_sync, session, thread_id, current_user, payload.body.strip(), payload.mentioned_user_ids
    )

    # Push to whoever's currently connected — the safety-net poll on each client covers
    # anyone who isn't (or whose socket silently dropped). This part stays on the event
    # loop directly; it's already async I/O, not a blocking call.
    await manager.broadcast(
        recipient_ids, {"type": "message", "thread_id": str(thread_id), "message": out.model_dump(mode="json")}
    )

    return out


def _get_owned_message(session: Session, thread_id: uuid.UUID, message_id: uuid.UUID) -> Message:
    message = session.get(Message, message_id)
    if not message or message.thread_id != thread_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    if message.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message was deleted")
    return message


@router.patch("/threads/{thread_id}/messages/{message_id}", response_model=MessageOut)
async def edit_message(
    thread_id: uuid.UUID,
    message_id: uuid.UUID,
    payload: EditMessageRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MessageOut:
    thread = _authorize_thread(session, current_user, thread_id)
    message = _get_owned_message(session, thread_id, message_id)
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own messages")

    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body is required")
    if len(body) > MAX_MESSAGE_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Message too long (max {MAX_MESSAGE_LENGTH} characters)",
        )

    message.body = body
    message.edited_at = datetime.utcnow()
    session.add(message)
    session.commit()
    session.refresh(message)

    people = _user_map(session, _parse_mention_ids(message.mentioned_user_ids))
    people[current_user.id] = current_user
    out = _message_out(message, people)

    await manager.broadcast(
        _recipients_for_thread(session, thread, thread_id),
        {"type": "message_edited", "thread_id": str(thread_id), "message": out.model_dump(mode="json")},
    )
    return out


@router.delete("/threads/{thread_id}/messages/{message_id}", response_model=MessageOut)
async def delete_message(
    thread_id: uuid.UUID,
    message_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> MessageOut:
    thread = _authorize_thread(session, current_user, thread_id)
    message = _get_owned_message(session, thread_id, message_id)
    if message.sender_id != current_user.id and current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own messages")

    # Clear the body/mentions in place rather than removing the row — keeps the message's
    # position in the timeline (and unread-count math) intact, with `deleted_at` as the only
    # trace so clients can render a "Message deleted" placeholder where it used to be.
    message.body = ""
    message.mentioned_user_ids = None
    message.deleted_at = datetime.utcnow()
    session.add(message)
    session.commit()
    session.refresh(message)

    out = _message_out(message, {current_user.id: current_user})

    await manager.broadcast(
        _recipients_for_thread(session, thread, thread_id),
        {"type": "message_deleted", "thread_id": str(thread_id), "message": out.model_dump(mode="json")},
    )
    return out


@router.post("/threads/{thread_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_thread_read(
    thread_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    _authorize_thread(session, current_user, thread_id)
    existing = session.exec(
        select(MessageRead).where(
            MessageRead.user_id == current_user.id, MessageRead.thread_id == thread_id
        )
    ).first()
    now = datetime.utcnow()
    if existing:
        existing.last_read_at = now
        session.add(existing)
    else:
        session.add(MessageRead(user_id=current_user.id, thread_id=thread_id, last_read_at=now))
    session.commit()


@ws_router.websocket("/ws")
async def messages_ws(websocket: WebSocket) -> None:
    """Push channel for new messages. The client must send `{"token": "<jwt>"}` as its
    first message within 10s of connecting — there's no Authorization header on a WS
    handshake, so this re-implements the same decode `get_current_user` uses.

    Deliberately does NOT depend on `get_session`: that would hold one of the app's 15
    pooled DB connections open for as long as the socket stays connected (potentially
    hours), which starves the pool for every other request once enough users are online
    at once. Instead, open a short-lived session just for the auth lookup below and let
    it close immediately — the connection sits idle with zero DB usage afterward.
    """
    await websocket.accept()
    settings = get_settings()
    user: Optional[User] = None
    try:
        first = await asyncio.wait_for(websocket.receive_json(), timeout=10)
        token = first.get("token") if isinstance(first, dict) else None
        if token:
            payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
            user_id = payload.get("user_id")
            if user_id:
                with Session(engine) as session:
                    user = session.get(User, uuid.UUID(user_id))
    except (asyncio.TimeoutError, JWTError, ValueError, KeyError):
        user = None

    if not user or not user.is_active:
        await websocket.close(code=4401)
        return

    await manager.connect(user.id, user.get_department_ids_list(), websocket)
    try:
        while True:
            # The client doesn't send anything meaningful after the handshake — this just
            # keeps the loop (and thus the connection) alive and detects disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(user.id, websocket)

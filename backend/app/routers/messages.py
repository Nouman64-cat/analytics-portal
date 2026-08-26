"""Internal team messaging: department-scoped DMs, groups, and department channels."""

from __future__ import annotations

import asyncio
import json
import uuid
from collections import defaultdict
from datetime import datetime
from typing import Optional

from botocore.exceptions import BotoCoreError, ClientError
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
    MessageAttachment,
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

# ─── Attachments (images + PDFs, uploaded browser → S3 directly via presigned URL) ────
_ATTACHMENT_ALLOWED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
}
MAX_ATTACHMENTS_PER_MESSAGE = 10

_s3_client_cache: dict = {}


def _get_s3_client(settings):
    try:
        import boto3
    except ImportError as e:
        raise HTTPException(status_code=500, detail="boto3 is required for S3 uploads") from e

    aws_access_key_id = settings.effective_aws_access_key_id
    aws_secret_access_key = settings.effective_aws_secret_access_key
    if not aws_access_key_id or not aws_secret_access_key:
        raise HTTPException(status_code=500, detail="AWS credentials are not configured")

    cache_key = (aws_access_key_id, settings.AWS_REGION)
    if cache_key not in _s3_client_cache:
        _s3_client_cache[cache_key] = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key,
        )
    return _s3_client_cache[cache_key]


def _presign_get_url(s3_client, settings, key: str, expiry: int = 604800) -> str:
    """Presigned GET (default 7 days) for a privately-stored attachment. Falls back to the
    raw (inaccessible without bucket policy changes) URL if signing fails for any reason —
    mirrors `make_presigned_doc_url` in app/email_ses.py."""
    try:
        return s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_S3_BUCKET_NAME, "Key": key},
            ExpiresIn=expiry,
        )
    except (BotoCoreError, ClientError):
        return f"https://{settings.AWS_S3_BUCKET_NAME}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"


class ContactOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str


class AttachmentOut(BaseModel):
    id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    url: str
    thumbnail_url: Optional[str] = None


class MessageOut(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    sender_id: uuid.UUID
    sender_name: str
    body: str
    # Contacts the sender explicitly @-tagged via the composer — used by clients to render
    # mentions in a distinct color and to notify a mentioned user.
    mentions: list[ContactOut] = []
    attachments: list[AttachmentOut] = []
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


class AttachmentInput(BaseModel):
    s3_key: str
    filename: str
    content_type: str
    size_bytes: int = 0
    # Client-rendered page-1 preview (PDFs only), uploaded via the same presign endpoint —
    # optional and best-effort; a message still sends fine if thumbnail generation failed.
    thumbnail_s3_key: Optional[str] = None


class SendMessageRequest(BaseModel):
    body: str = ""
    mentioned_user_ids: list[uuid.UUID] = []
    attachments: list[AttachmentInput] = []


class CreateGroupRequest(BaseModel):
    title: str
    participant_user_ids: list[uuid.UUID]


class PresignAttachmentRequest(BaseModel):
    filename: str
    content_type: str


class PresignAttachmentResponse(BaseModel):
    upload_url: str
    s3_key: str


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


def _attachment_out(a: MessageAttachment, s3_client, settings) -> AttachmentOut:
    return AttachmentOut(
        id=a.id,
        filename=a.filename,
        content_type=a.content_type,
        size_bytes=a.size_bytes,
        url=_presign_get_url(s3_client, settings, a.s3_key),
        thumbnail_url=_presign_get_url(s3_client, settings, a.thumbnail_s3_key) if a.thumbnail_s3_key else None,
    )


def _attachments_map(
    session: Session, message_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[MessageAttachment]]:
    if not message_ids:
        return {}
    rows = session.exec(
        select(MessageAttachment)
        .where(MessageAttachment.message_id.in_(message_ids))
        .order_by(MessageAttachment.created_at.asc())
    ).all()
    out: dict[uuid.UUID, list[MessageAttachment]] = defaultdict(list)
    for a in rows:
        out[a.message_id].append(a)
    return out


def _message_out(
    m: Message,
    people: dict[uuid.UUID, User],
    attachments: Optional[list[MessageAttachment]] = None,
    s3_client=None,
    settings=None,
) -> MessageOut:
    sender = people.get(m.sender_id)
    mentions = [_contact_out(people[uid]) for uid in _parse_mention_ids(m.mentioned_user_ids) if uid in people]
    attachment_outs = (
        [_attachment_out(a, s3_client, settings) for a in attachments]
        if attachments and s3_client is not None and settings is not None
        else []
    )
    return MessageOut(
        id=m.id,
        thread_id=m.thread_id,
        sender_id=m.sender_id,
        sender_name=sender.full_name if sender else "Unknown",
        body=m.body,
        mentions=mentions,
        attachments=attachment_outs,
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


def _build_thread_summaries(session: Session, current_user: User, settings) -> list[ThreadSummaryOut]:
    all_threads = _my_threads(session, current_user)
    if not all_threads:
        return []
    thread_ids = [t.id for t in all_threads]
    channel_threads = [t for t in all_threads if t.kind == MessageThreadKind.CHANNEL]

    messages = session.exec(
        select(Message).where(Message.thread_id.in_(thread_ids)).order_by(Message.created_at.desc())
    ).all()

    read_rows = session.exec(
        select(MessageRead).where(
            MessageRead.user_id == current_user.id, MessageRead.thread_id.in_(thread_ids)
        )
    ).all()
    last_read_by_thread = {r.thread_id: r.last_read_at for r in read_rows}
    # "Clear chat for me" watermark — messages at/before this are hidden from my view only;
    # every other participant's copy of the thread is untouched.
    cleared_by_thread = {r.thread_id: r.cleared_at for r in read_rows if r.cleared_at}
    # "Remove chat for me" watermark — the thread itself drops out of my list below unless a
    # message newer than this shows up (from anyone), same self-healing rule as clearing.
    removed_by_thread = {r.thread_id: r.removed_at for r in read_rows if r.removed_at}

    last_message_by_thread: dict[uuid.UUID, Message] = {}
    unread_counts: dict[uuid.UUID, int] = defaultdict(int)
    for m in messages:
        cleared = cleared_by_thread.get(m.thread_id)
        if cleared and m.created_at <= cleared:
            continue
        if m.thread_id not in last_message_by_thread:
            last_message_by_thread[m.thread_id] = m
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
    attachments_by_message = _attachments_map(session, [m.id for m in last_message_by_thread.values()])
    s3_client = _get_s3_client(settings) if attachments_by_message else None

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
        # Removed from my list and nothing's happened since — stays hidden. Any message
        # newer than the removal (last_message_by_thread is already cleared-at-filtered, so
        # its presence here means "newer than max(cleared_at, removed_at)") brings it back.
        if removed_by_thread.get(t.id) and t.id not in last_message_by_thread:
            continue
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
        last_message_out = (
            _message_out(last_msg, people, attachments_by_message.get(last_msg.id), s3_client, settings)
            if last_msg
            else None
        )

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
    settings=Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> list[ThreadSummaryOut]:
    """All threads visible to me: my DMs/groups, plus every department channel in my scope."""
    return _build_thread_summaries(session, current_user, settings)


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


def _cleared_at_for(session: Session, user_id: uuid.UUID, thread_id: uuid.UUID) -> Optional[datetime]:
    """This user's "clear chat" watermark for this thread, if they've ever cleared it."""
    row = session.exec(
        select(MessageRead).where(MessageRead.user_id == user_id, MessageRead.thread_id == thread_id)
    ).first()
    return row.cleared_at if row else None


@router.get("/threads/{thread_id}/messages", response_model=list[MessageOut])
def get_thread_messages(
    thread_id: uuid.UUID,
    before: Optional[datetime] = None,
    around: Optional[uuid.UUID] = None,
    limit: int = 50,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> list[MessageOut]:
    """Cursor-paginated history, newest-first internally, returned oldest-first for display.
    Pass `around` (a message id, e.g. from a search result) instead of `before` to fetch a
    window of context centered on that message rather than the most recent page."""
    _authorize_thread(session, current_user, thread_id)
    limit = max(1, min(limit, 100))
    cleared = _cleared_at_for(session, current_user.id, thread_id)

    if around:
        target = session.get(Message, around)
        if not target or target.thread_id != thread_id or (cleared and target.created_at <= cleared):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        half = max(1, limit // 2)
        older_stmt = select(Message).where(Message.thread_id == thread_id, Message.created_at < target.created_at)
        if cleared:
            older_stmt = older_stmt.where(Message.created_at > cleared)
        older = session.exec(older_stmt.order_by(Message.created_at.desc()).limit(half)).all()
        newer = session.exec(
            select(Message)
            .where(Message.thread_id == thread_id, Message.created_at > target.created_at)
            .order_by(Message.created_at.asc())
            .limit(half)
        ).all()
        rows = list(reversed(newer)) + [target] + older  # descending order, matches the branch below
    else:
        stmt = select(Message).where(Message.thread_id == thread_id)
        if cleared:
            stmt = stmt.where(Message.created_at > cleared)
        if before:
            stmt = stmt.where(Message.created_at < before)
        stmt = stmt.order_by(Message.created_at.desc()).limit(limit)
        rows = session.exec(stmt).all()

    people = _user_map(
        session, [m.sender_id for m in rows] + [uid for m in rows for uid in _parse_mention_ids(m.mentioned_user_ids)]
    )
    attachments_by_message = _attachments_map(session, [m.id for m in rows])
    s3_client = _get_s3_client(settings) if attachments_by_message else None
    out = [_message_out(m, people, attachments_by_message.get(m.id), s3_client, settings) for m in rows]
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
    cleared = _cleared_at_for(session, current_user.id, thread_id)

    stmt = select(Message).where(
        Message.thread_id == thread_id, Message.body.ilike(f"%{_escape_like(needle)}%", escape="\\")
    )
    if cleared:
        stmt = stmt.where(Message.created_at > cleared)
    stmt = stmt.order_by(Message.created_at.desc()).limit(limit)
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
    session: Session,
    thread_id: uuid.UUID,
    current_user: User,
    body: str,
    mentioned_user_ids: list[uuid.UUID],
    attachments: list[AttachmentInput],
    settings,
) -> tuple[MessageOut, set[uuid.UUID]]:
    """All the synchronous DB work for sending a message. Run via `run_in_threadpool` so it
    never blocks the event loop — this app runs as a single uvicorn process with no worker
    pool, so a blocking call here would stall every other request (interviews, leads,
    everything), not just messaging, for its duration."""
    thread = _authorize_thread(session, current_user, thread_id)
    if not body and not attachments:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body is required")
    if len(body) > MAX_MESSAGE_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Message too long (max {MAX_MESSAGE_LENGTH} characters)",
        )
    if len(attachments) > MAX_ATTACHMENTS_PER_MESSAGE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many attachments (max {MAX_ATTACHMENTS_PER_MESSAGE})",
        )
    # The presign step already restricts content-type and scopes the key under this thread,
    # but a client could skip it and hand us an arbitrary key/type here — re-validate both so
    # a message can never end up pointing at (and thus exposing a presigned GET for) an S3
    # object outside its own thread's upload prefix.
    expected_prefix = f"messages/{thread_id}/"
    for a in attachments:
        if a.content_type not in _ATTACHMENT_ALLOWED_TYPES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported attachment type")
        if not a.s3_key.startswith(expected_prefix):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid attachment")
        if a.thumbnail_s3_key and not a.thumbnail_s3_key.startswith(expected_prefix):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid attachment")

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
    session.flush()

    attachment_rows = [
        MessageAttachment(
            message_id=message.id,
            s3_key=a.s3_key,
            filename=a.filename[:255],
            content_type=a.content_type,
            size_bytes=max(0, a.size_bytes),
            thumbnail_s3_key=a.thumbnail_s3_key,
        )
        for a in attachments
    ]
    for row in attachment_rows:
        session.add(row)
    session.commit()
    session.refresh(message)

    people = _user_map(session, mention_ids)
    people[current_user.id] = current_user
    s3_client = _get_s3_client(settings) if attachment_rows else None
    out = _message_out(message, people, attachment_rows, s3_client, settings)
    return out, _recipients_for_thread(session, thread, thread_id)


@router.post("/threads/{thread_id}/attachments/presign-upload", response_model=PresignAttachmentResponse)
def presign_attachment_upload(
    thread_id: uuid.UUID,
    payload: PresignAttachmentRequest,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> PresignAttachmentResponse:
    """Generate a presigned S3 PUT URL so the browser can upload an attachment directly to
    S3 — the file's bytes never pass through this server. Call once per file; multiple
    files upload in parallel, then their s3_keys are attached to the message on send."""
    _authorize_thread(session, current_user, thread_id)
    if payload.content_type not in _ATTACHMENT_ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only images (JPEG/PNG/WEBP/GIF) and PDF files are allowed",
        )
    if not settings.AWS_S3_BUCKET_NAME:
        raise HTTPException(status_code=500, detail="AWS S3 bucket not configured")

    ext = _ATTACHMENT_ALLOWED_TYPES[payload.content_type]
    key = f"messages/{thread_id}/{uuid.uuid4()}.{ext}"
    s3_client = _get_s3_client(settings)
    try:
        upload_url = s3_client.generate_presigned_url(
            "put_object",
            Params={"Bucket": settings.AWS_S3_BUCKET_NAME, "Key": key, "ContentType": payload.content_type},
            ExpiresIn=300,
        )
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate presigned URL: {e}")

    return PresignAttachmentResponse(upload_url=upload_url, s3_key=key)


@router.post("/threads/{thread_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def send_message(
    thread_id: uuid.UUID,
    payload: SendMessageRequest,
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> MessageOut:
    out, recipient_ids = await run_in_threadpool(
        _send_message_sync,
        session,
        thread_id,
        current_user,
        payload.body.strip(),
        payload.mentioned_user_ids,
        payload.attachments,
        settings,
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
    settings=Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> MessageOut:
    thread = _authorize_thread(session, current_user, thread_id)
    message = _get_owned_message(session, thread_id, message_id)
    if message.sender_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own messages")

    body = payload.body.strip()
    attachments = _attachments_map(session, [message.id]).get(message.id, [])
    if not body and not attachments:
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
    s3_client = _get_s3_client(settings) if attachments else None
    out = _message_out(message, people, attachments, s3_client, settings)

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

    # Clear the body/mentions/attachments in place rather than removing the row — keeps the
    # message's position in the timeline (and unread-count math) intact, with `deleted_at`
    # as the only trace so clients can render a "Message deleted" placeholder where it used
    # to be. Attachment rows are removed (S3 objects are left in place, same as every other
    # feature in this codebase that never garbage-collects a replaced/orphaned upload).
    message.body = ""
    message.mentioned_user_ids = None
    message.deleted_at = datetime.utcnow()
    session.add(message)
    for a in session.exec(select(MessageAttachment).where(MessageAttachment.message_id == message.id)).all():
        session.delete(a)
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


@router.post("/threads/{thread_id}/clear", status_code=status.HTTP_204_NO_CONTENT)
def clear_thread(
    thread_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    """"Clear chat for me" — hides everything sent up to now from this user's view of the
    thread (history, search, thread-list preview). Purely a per-user watermark: it never
    touches the `Message` rows themselves, so every other participant (the other side of a
    DM, or the rest of a group/channel) keeps their history exactly as it was. If someone
    sends a new message afterwards, it shows up normally — same as WhatsApp's per-device
    "Clear chat" (as opposed to "Delete for everyone")."""
    _authorize_thread(session, current_user, thread_id)
    existing = session.exec(
        select(MessageRead).where(
            MessageRead.user_id == current_user.id, MessageRead.thread_id == thread_id
        )
    ).first()
    now = datetime.utcnow()
    if existing:
        existing.cleared_at = now
        existing.last_read_at = now
        session.add(existing)
    else:
        session.add(MessageRead(user_id=current_user.id, thread_id=thread_id, last_read_at=now, cleared_at=now))
    session.commit()


@router.post("/threads/{thread_id}/remove", status_code=status.HTTP_204_NO_CONTENT)
def remove_thread(
    thread_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> None:
    """"Delete chat for me" — drops the thread out of this user's messages list entirely
    (on top of clearing its history, same as `clear_thread`), while every other participant
    keeps the thread and its history exactly as it was. A DM/group/channel can't otherwise
    be "deleted" server-side since it's shared state; this only ever affects the caller's
    own view. If anyone sends a new message afterwards — including the remover, e.g. via
    "New message" to the same person — the thread reappears in the list automatically,
    same as WhatsApp's "Delete chat"."""
    _authorize_thread(session, current_user, thread_id)
    existing = session.exec(
        select(MessageRead).where(
            MessageRead.user_id == current_user.id, MessageRead.thread_id == thread_id
        )
    ).first()
    now = datetime.utcnow()
    if existing:
        existing.cleared_at = now
        existing.removed_at = now
        existing.last_read_at = now
        session.add(existing)
    else:
        session.add(
            MessageRead(
                user_id=current_user.id, thread_id=thread_id, last_read_at=now, cleared_at=now, removed_at=now
            )
        )
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

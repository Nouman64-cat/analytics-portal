"""Superadmin-only database backup to S3."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.activity_log import record_activity
from app.backup_db import (
    build_backup_s3_key,
    list_backup_objects,
    run_pg_dump_gzip,
    upload_bytes_to_s3,
)
from app.config import get_settings
from app.database import get_session
from app.deps import require_superadmin
from app.models.user import User
from app.schemas.backup import BackupCreatedResponse, BackupListItem, BackupListResponse

router = APIRouter(
    prefix="/api/v1/admin/backup",
    tags=["Admin — Backup"],
)


@router.post("/", response_model=BackupCreatedResponse)
def create_database_backup(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_superadmin),
):
    """Dump PostgreSQL with pg_dump, gzip, upload to S3. Requires pg_dump on the server."""
    settings = get_settings()
    try:
        blob = run_pg_dump_gzip(
            settings.DATABASE_URL,
            pg_dump_bin=settings.PG_DUMP_PATH,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    s3_key = build_backup_s3_key()
    upload_bytes_to_s3(settings, key=s3_key, body=blob)

    now = datetime.now(timezone.utc)
    record_activity(
        session,
        actor=current_user,
        action="database_backup",
        entity_type="backup",
        entity_id=None,
        message=f"S3 backup uploaded: {s3_key} ({len(blob)} bytes)",
    )
    session.commit()

    return BackupCreatedResponse(
        bucket=settings.AWS_S3_BUCKET_NAME,
        s3_key=s3_key,
        size_bytes=len(blob),
        created_at=now.isoformat().replace("+00:00", "Z"),
    )


@router.get("/", response_model=BackupListResponse)
def list_backups(
    _current_user: User = Depends(require_superadmin),
):
    """List recent backup objects in the configured S3 bucket (prefix backups/)."""
    settings = get_settings()
    contents, list_unavailable_reason = list_backup_objects(settings)
    items: list[BackupListItem] = []
    for obj in contents:
        key = obj.get("Key") or ""
        if not key.endswith(".sql.gz"):
            continue
        lm = obj.get("LastModified")
        items.append(
            BackupListItem(
                s3_key=key,
                size_bytes=obj.get("Size"),
                last_modified=lm.isoformat().replace("+00:00", "Z") if lm else None,
            )
        )
    return BackupListResponse(
        items=items, list_unavailable_reason=list_unavailable_reason
    )

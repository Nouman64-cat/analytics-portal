from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta

from sqlmodel import Session

from app.activity_log import record_activity
from app.backup_db import build_backup_s3_key, run_pg_dump_gzip, upload_bytes_to_s3
from app.config import Settings
from app.database import engine

logger = logging.getLogger(__name__)

_PKT_OFFSET = timedelta(hours=5)


def _now_pkt() -> datetime:
    return datetime.utcnow() + _PKT_OFFSET


def _run_nightly_backup(settings: Settings) -> None:
    blob = run_pg_dump_gzip(
        settings.DATABASE_URL,
        pg_dump_bin=settings.PG_DUMP_PATH,
        exclude_schemas=settings.PG_DUMP_EXCLUDE_SCHEMAS,
    )
    s3_key = build_backup_s3_key()
    upload_bytes_to_s3(settings, key=s3_key, body=blob)

    with Session(engine) as session:
        record_activity(
            session,
            actor=None,
            action="database_backup",
            entity_type="backup",
            entity_id=None,
            message=f"Scheduled nightly S3 backup uploaded: {s3_key} ({len(blob)} bytes)",
        )
        session.commit()

    logger.info("Nightly database backup uploaded: key=%s size=%s", s3_key, len(blob))


async def run_backup_scheduler(stop_event: asyncio.Event, settings: Settings) -> None:
    """Background loop that runs a database backup once per day at 12:00 AM PKT."""
    last_run: date | None = None
    while not stop_event.is_set():
        try:
            now_pkt = _now_pkt()
            if now_pkt.hour == 0 and last_run != now_pkt.date():
                try:
                    _run_nightly_backup(settings)
                except Exception:
                    logger.exception("Scheduled nightly database backup failed")
                finally:
                    # Mark the day as attempted even on failure so we don't retry
                    # every minute for the rest of the midnight hour.
                    last_run = now_pkt.date()
        except Exception:
            logger.exception("Backup scheduler tick failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            continue

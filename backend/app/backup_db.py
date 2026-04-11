"""Create a PostgreSQL logical backup (pg_dump), gzip it, and upload to S3."""

from __future__ import annotations

import gzip
import subprocess
from datetime import datetime, timezone
from typing import Optional

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException

from app.config import Settings


def normalize_database_url_for_pg_dump(database_url: str) -> str:
    """Strip SQLAlchemy driver extras so pg_dump accepts the URL."""
    u = database_url.strip()
    if "://" in u:
        scheme, rest = u.split("://", 1)
        if "+" in scheme:
            scheme = scheme.split("+")[0]
        u = f"{scheme}://{rest}"
    if u.startswith("postgres://"):
        u = "postgresql://" + u[len("postgres://") :]
    return u


def build_backup_s3_key(prefix: str = "backups/") -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%SZ")
    p = prefix if prefix.endswith("/") else prefix + "/"
    return f"{p}rizviz-db-{ts}.sql.gz"


def run_pg_dump_gzip(database_url: str, *, pg_dump_bin: str = "pg_dump") -> bytes:
    """Run pg_dump and return gzip-compressed SQL bytes."""
    url = normalize_database_url_for_pg_dump(database_url)
    if not url.startswith("postgresql://"):
        raise ValueError("Database backup requires a PostgreSQL DATABASE_URL")

    bin_path = (pg_dump_bin or "pg_dump").strip() or "pg_dump"

    try:
        proc = subprocess.run(
            [bin_path, url, "--no-owner", "--no-acl"],
            capture_output=True,
            timeout=3600,
        )
    except FileNotFoundError as e:
        raise RuntimeError(
            f"pg_dump not found or not executable: {bin_path!r}. "
            "Install PostgreSQL client tools or set PG_DUMP_PATH to the pg_dump binary."
        ) from e
    except subprocess.TimeoutExpired as e:
        raise RuntimeError("pg_dump timed out after 1 hour") from e

    if proc.returncode != 0:
        err = (
            proc.stderr.decode("utf-8", errors="replace")
            if proc.stderr
            else "unknown error"
        )
        extra = ""
        el = err.lower()
        if "version mismatch" in el or "aborting because of server version" in el:
            extra = (
                " The pg_dump client major version must be >= the server major version. "
                "Example (Homebrew): `brew install postgresql@16`, then set PG_DUMP_PATH to "
                "`/opt/homebrew/opt/postgresql@16/bin/pg_dump` (Apple Silicon) or "
                "`/usr/local/opt/postgresql@16/bin/pg_dump` (Intel)."
            )
        raise RuntimeError(f"pg_dump failed: {err.strip()}{extra}")

    return gzip.compress(proc.stdout)


def get_s3_client(settings: Settings):
    try:
        import boto3
    except ImportError as e:
        raise HTTPException(
            status_code=500, detail="boto3 is required for S3 backups"
        ) from e

    key = settings.effective_aws_access_key_id
    secret = settings.effective_aws_secret_access_key
    if not key or not secret:
        raise HTTPException(
            status_code=500, detail="AWS credentials are not configured"
        )

    return boto3.client(
        "s3",
        region_name=settings.AWS_REGION,
        aws_access_key_id=key,
        aws_secret_access_key=secret,
    )


def upload_bytes_to_s3(
    settings: Settings,
    *,
    key: str,
    body: bytes,
) -> None:
    client = get_s3_client(settings)
    bucket = settings.AWS_S3_BUCKET_NAME
    if not bucket:
        raise HTTPException(status_code=500, detail="AWS_S3_BUCKET_NAME is not set")
    try:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=body,
            ContentType="application/gzip",
            ServerSideEncryption="AES256",
        )
    except (BotoCoreError, ClientError) as e:
        raise HTTPException(
            status_code=500, detail=f"S3 upload failed: {e}"
        ) from e


def list_backup_objects(
    settings: Settings, *, prefix: str = "backups/", max_keys: int = 50
) -> tuple[list, Optional[str]]:
    """Return recent objects under prefix (newest first) and optional notice if listing was denied.

    PutObject (uploads) does not require ListBucket; ListObjectsV2 does. IAM policies often allow
    the former on ``arn:aws:s3:::bucket/*`` without granting ``s3:ListBucket`` on ``arn:aws:s3:::bucket``.
    """
    client = get_s3_client(settings)
    bucket = settings.AWS_S3_BUCKET_NAME
    if not bucket:
        raise HTTPException(status_code=500, detail="AWS_S3_BUCKET_NAME is not set")
    try:
        resp = client.list_objects_v2(
            Bucket=bucket, Prefix=prefix, MaxKeys=max_keys
        )
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code == "AccessDenied":
            return [], (
                "Listing is denied (missing s3:ListBucket on this bucket). Interview and resume uploads "
                "still work because they only need s3:PutObject on object keys, not listing. "
                "Add ListBucket for this user on the bucket (or remove the explicit deny) to show backup files here."
            )
        raise HTTPException(status_code=500, detail=f"S3 list failed: {e}") from e
    except BotoCoreError as e:
        raise HTTPException(status_code=500, detail=f"S3 list failed: {e}") from e

    contents = resp.get("Contents") or []
    contents.sort(
        key=lambda x: x.get("LastModified")
        or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return contents, None

from pydantic import BaseModel, Field


class BackupCreatedResponse(BaseModel):
    bucket: str
    s3_key: str
    size_bytes: int
    created_at: str = Field(
        ...,
        description="UTC ISO8601 timestamp when the backup was stored",
    )


class BackupListItem(BaseModel):
    s3_key: str
    size_bytes: int | None = None
    last_modified: str | None = Field(
        None, description="UTC ISO8601 from S3 LastModified"
    )


class BackupListResponse(BaseModel):
    items: list[BackupListItem]
    list_unavailable_reason: str | None = Field(
        None,
        description="If set, the table is empty because S3 listing failed (e.g. missing s3:ListBucket); uploads may still work.",
    )

from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from .env file."""

    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/rizviz-interviews-ai"
    # PostgreSQL schema for app tables (public, moeed, …). Same table names can exist in each schema;
    # switch via env to point the app at different data. Requires identical DDL in that schema.
    DATABASE_SCHEMA: str = Field("public", env="DATABASE_SCHEMA")
    APP_NAME: str = "RizViz Analytics Portal"
    APP_ENV: str = "development"
    DEBUG: bool = True
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    JWT_SECRET_KEY: str = "change-me-in-production"
    CLIENT_URL: str = "http://localhost:3000"

    AWS_S3_BUCKET_NAME: str = Field(
        "rizviz-interviews", env="AWS_S3_BUCKET_NAME")
    AWS_REGION: str = Field("us-east-1", env="AWS_REGION")
    AWS_ACCESS_KEY_ID: Optional[str] = Field(None, env="AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: Optional[str] = Field(
        None, env="AWS_SECRET_ACCESS_KEY")

    # AWS SES SMTP (verified sender domain/email required in SES console)
    AWS_SES_USERNAME: Optional[str] = Field(None, env="AWS_SES_USERNAME")
    AWS_SES_PASSWORD: Optional[str] = Field(None, env="AWS_SES_PASSWORD")
    AWS_SES_FROM_EMAIL: str = Field(
        "info@zygotrix.com", env="AWS_SES_FROM_EMAIL"
    )

    # Backwards compatibility for existing .env variable names
    AWS_IAM_KEY: Optional[str] = Field(None, env="AWS_IAM_KEY")
    AWS_IAM_SECRET: Optional[str] = Field(None, env="AWS_IAM_SECRET")

    # Maximum request body size in bytes (multipart uploads). Default 50MB for PDFs / interview docs.
    # If you use nginx, set client_max_body_size to at least this value or requests never reach the app.
    MAX_UPLOAD_SIZE: int = Field(50 * 1024 * 1024, env="MAX_UPLOAD_SIZE")

    # pg_dump major version must be >= PostgreSQL server major version (e.g. use postgresql@16 client for PG16).
    # Default "pg_dump" uses whatever is first on PATH; set full path if multiple versions are installed.
    PG_DUMP_PATH: str = Field("pg_dump", env="PG_DUMP_PATH")
    # Comma-separated schemas for pg_dump --exclude-schema. Neon adds "neon_auth" (managed; app role cannot dump it).
    # Set empty to exclude nothing (self-hosted only). Default neon_auth.
    PG_DUMP_EXCLUDE_SCHEMAS: str = Field("neon_auth", env="PG_DUMP_EXCLUDE_SCHEMAS")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def effective_aws_access_key_id(self) -> str:
        return self.AWS_ACCESS_KEY_ID or self.AWS_IAM_KEY

    @property
    def effective_aws_secret_access_key(self) -> str:
        return self.AWS_SECRET_ACCESS_KEY or self.AWS_IAM_SECRET

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()

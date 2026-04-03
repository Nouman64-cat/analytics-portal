from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from .env file."""

    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/rizviz-interviews-ai"
    APP_NAME: str = "RizViz Analytics Portal"
    APP_ENV: str = "development"
    DEBUG: bool = True
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    JWT_SECRET_KEY: str = "change-me-in-production"

    AWS_S3_BUCKET_NAME: str = Field(
        "rizviz-interviews", env="AWS_S3_BUCKET_NAME")
    AWS_REGION: str = Field("us-east-1", env="AWS_REGION")
    AWS_ACCESS_KEY_ID: Optional[str] = Field(None, env="AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: Optional[str] = Field(
        None, env="AWS_SECRET_ACCESS_KEY")

    # AWS SES (legacy) variables: some environments still include these.
    AWS_SES_USERNAME: Optional[str] = Field(None, env="AWS_SES_USERNAME")
    AWS_SES_PASSWORD: Optional[str] = Field(None, env="AWS_SES_PASSWORD")

    # Backwards compatibility for existing .env variable names
    AWS_IAM_KEY: Optional[str] = Field(None, env="AWS_IAM_KEY")
    AWS_IAM_SECRET: Optional[str] = Field(None, env="AWS_IAM_SECRET")

    # Maximum request body size in bytes (multipart uploads). Default 50MB for PDFs / interview docs.
    # If you use nginx, set client_max_body_size to at least this value or requests never reach the app.
    MAX_UPLOAD_SIZE: int = Field(50 * 1024 * 1024, env="MAX_UPLOAD_SIZE")

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

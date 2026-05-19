"""Superadmin-only debug endpoints (email test, config check)."""

from __future__ import annotations

import smtplib
import ssl
import traceback

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.config import get_settings
from app.deps import get_current_user
from app.models.user import User, UserRole

router = APIRouter(prefix="/api/v1/debug", tags=["Debug"])


def _require_superadmin(current_user: User) -> None:
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin only")


class EmailTestResult(BaseModel):
    success: bool
    to_email: str
    from_email: str | None
    smtp_host: str | None
    error: str | None
    detail: str | None


@router.get("/email", response_model=EmailTestResult, dependencies=[Depends(get_current_user)])
def test_email(
    to: str,
    current_user: User = Depends(get_current_user),
    settings=Depends(get_settings),
) -> EmailTestResult:
    """
    Send a test email and return the exact result.
    Superadmin only. Usage: GET /api/v1/debug/email?to=youraddress@example.com
    """
    _require_superadmin(current_user)

    smtp_host = f"email-smtp.{settings.AWS_REGION}.amazonaws.com"

    if not settings.AWS_SES_FROM_EMAIL:
        return EmailTestResult(
            success=False, to_email=to, from_email=None, smtp_host=smtp_host,
            error="MissingConfig", detail="AWS_SES_FROM_EMAIL is not set in .env",
        )
    if not settings.AWS_SES_USERNAME or not settings.AWS_SES_PASSWORD:
        return EmailTestResult(
            success=False, to_email=to, from_email=settings.AWS_SES_FROM_EMAIL,
            smtp_host=smtp_host, error="MissingConfig",
            detail="AWS_SES_USERNAME or AWS_SES_PASSWORD is not set in .env",
        )

    try:
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        msg = MIMEMultipart("alternative")
        msg["Subject"] = "RizViz Portal — Email Test"
        msg["From"] = settings.AWS_SES_FROM_EMAIL
        msg["To"] = to
        msg.attach(MIMEText("This is a test email from the RizViz Analytics Portal debug endpoint.", "plain", "utf-8"))

        context = ssl.create_default_context()
        with smtplib.SMTP(smtp_host, 587, timeout=15) as server:
            server.starttls(context=context)
            server.login(settings.AWS_SES_USERNAME, settings.AWS_SES_PASSWORD)
            server.send_message(msg)

        return EmailTestResult(
            success=True, to_email=to, from_email=settings.AWS_SES_FROM_EMAIL,
            smtp_host=smtp_host, error=None, detail="Email sent successfully",
        )
    except smtplib.SMTPAuthenticationError as e:
        return EmailTestResult(
            success=False, to_email=to, from_email=settings.AWS_SES_FROM_EMAIL,
            smtp_host=smtp_host, error="SMTPAuthenticationError",
            detail=f"Credentials rejected by SES: {e.smtp_code} {e.smtp_error!r}",
        )
    except smtplib.SMTPException as e:
        return EmailTestResult(
            success=False, to_email=to, from_email=settings.AWS_SES_FROM_EMAIL,
            smtp_host=smtp_host, error=type(e).__name__,
            detail=str(e),
        )
    except Exception as e:
        return EmailTestResult(
            success=False, to_email=to, from_email=settings.AWS_SES_FROM_EMAIL,
            smtp_host=smtp_host, error=type(e).__name__,
            detail=traceback.format_exc(),
        )

"""Send transactional email via Amazon SES SMTP (credentials: AWS_SES_USERNAME / AWS_SES_PASSWORD)."""

from __future__ import annotations

import html as html_module
import logging
import smtplib
import ssl
from datetime import date, time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.config import Settings

logger = logging.getLogger(__name__)


def _ses_smtp_host(region: str) -> str:
    return f"email-smtp.{region}.amazonaws.com"


def _format_date(d: Optional[date]) -> str:
    if not d:
        return "TBD"
    return d.strftime("%B %d, %Y")


def _format_time(t: Optional[time]) -> str:
    if not t:
        return "—"
    return t.strftime("%I:%M %p")


def interview_notification_html(
    *,
    candidate_name: str,
    company_name: str,
    role: str,
    round_name: str,
    interview_date: Optional[date],
    time_est: Optional[time],
    time_pkt: Optional[time],
    interviewer: Optional[str],
    interview_link: Optional[str],
    is_phone_call: bool,
) -> str:
    safe = html_module.escape
    rows = [
        ("Company", safe(company_name or "—")),
        ("Role", safe(role)),
        ("Round", safe(round_name)),
        ("Date", safe(_format_date(interview_date))),
        ("Time (US Eastern)", safe(_format_time(time_est))),
        ("Time (PKT)", safe(_format_time(time_pkt))),
        ("Format", "Phone call" if is_phone_call else "Video / other"),
    ]
    if interviewer:
        rows.append(("Contact / interviewer", safe(interviewer)))
    if interview_link:
        esc_link = safe(interview_link)
        rows.append(
            ("Meeting link", f'<a href="{esc_link}">{esc_link}</a>'),
        )

    body_rows = "".join(
        f"<tr><td style=\"padding:8px 12px;border:1px solid #e2e8f0;background:#f8fafc;width:40%;font-weight:600;\">{safe(k)}</td>"
        f"<td style=\"padding:8px 12px;border:1px solid #e2e8f0;\">{v}</td></tr>"
        for k, v in rows
    )
    return f"""\
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#0f172a;">
  <p>Hi {safe(candidate_name)},</p>
  <p>Here are your interview details:</p>
  <table style="border-collapse:collapse;width:100%;max-width:560px;margin:16px 0;">
    {body_rows}
  </table>
  <p style="color:#64748b;font-size:14px;">If anything looks wrong, reply to this email or contact your recruiter.</p>
</body>
</html>
"""


def send_interview_created_email(
    settings: "Settings",
    *,
    to_email: str,
    candidate_name: str,
    company_name: str,
    role: str,
    round_name: str,
    interview_date: Optional[date],
    time_est: Optional[time],
    time_pkt: Optional[time],
    interviewer: Optional[str],
    interview_link: Optional[str],
    is_phone_call: bool,
) -> None:
    """Raise on SMTP failure; caller should catch and log."""
    if not settings.AWS_SES_FROM_EMAIL:
        raise RuntimeError("AWS_SES_FROM_EMAIL is not set")
    if not settings.AWS_SES_USERNAME or not settings.AWS_SES_PASSWORD:
        raise RuntimeError("AWS_SES SMTP credentials are not set")

    html = interview_notification_html(
        candidate_name=candidate_name,
        company_name=company_name,
        role=role,
        round_name=round_name,
        interview_date=interview_date,
        time_est=time_est,
        time_pkt=time_pkt,
        interviewer=interviewer,
        interview_link=interview_link,
        is_phone_call=is_phone_call,
    )
    plain = (
        f"Hi {candidate_name},\n\n"
        f"Company: {company_name}\n"
        f"Role: {role}\n"
        f"Round: {round_name}\n"
        f"Date: {_format_date(interview_date)}\n"
        f"Time (EST): {_format_time(time_est)}\n"
        f"Time (PKT): {_format_time(time_pkt)}\n"
    )
    if interview_link:
        plain += f"Link: {interview_link}\n"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Interview scheduled — {company_name or 'Interview'}"
    msg["From"] = settings.AWS_SES_FROM_EMAIL
    msg["To"] = to_email
    msg.attach(MIMEText(plain, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    host = _ses_smtp_host(settings.AWS_REGION)
    context = ssl.create_default_context()
    with smtplib.SMTP(host, 587, timeout=30) as server:
        server.starttls(context=context)
        server.login(settings.AWS_SES_USERNAME, settings.AWS_SES_PASSWORD)
        server.send_message(msg)

    logger.info("Sent interview notification email to %s", to_email)


def try_send_interview_created_email(
    settings: "Settings",
    *,
    to_email: Optional[str],
    candidate_name: str,
    company_name: str,
    role: str,
    round_name: str,
    interview_date: Optional[date],
    time_est: Optional[time],
    time_pkt: Optional[time],
    interviewer: Optional[str],
    interview_link: Optional[str],
    is_phone_call: bool,
) -> None:
    """Send if SES + from address are configured; no-op if candidate has no email. Logs errors, does not raise."""
    if not to_email or not str(to_email).strip():
        logger.debug("Skipping interview email: no candidate email")
        return
    if not settings.AWS_SES_FROM_EMAIL:
        logger.warning("Skipping interview email: AWS_SES_FROM_EMAIL not set")
        return
    if not settings.AWS_SES_USERNAME or not settings.AWS_SES_PASSWORD:
        logger.warning("Skipping interview email: AWS_SES SMTP credentials not set")
        return
    try:
        send_interview_created_email(
            settings,
            to_email=to_email.strip(),
            candidate_name=candidate_name,
            company_name=company_name,
            role=role,
            round_name=round_name,
            interview_date=interview_date,
            time_est=time_est,
            time_pkt=time_pkt,
            interviewer=interviewer,
            interview_link=interview_link,
            is_phone_call=is_phone_call,
        )
    except Exception:
        logger.exception("Failed to send interview notification email")

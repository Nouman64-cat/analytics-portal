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
    title: str = "Your interview details",
    eyebrow: str = "Interview Update",
    intro_text: Optional[str] = None,
    cta_label: str = "Join Interview",
) -> str:
    safe = html_module.escape
    brand = "#4f46e5"
    card_bg = "#ffffff"
    soft_bg = "#f8fafc"
    border = "#e2e8f0"
    text_main = "#0f172a"
    text_muted = "#64748b"

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
        f"<tr><td style=\"padding:10px 12px;border:1px solid {border};background:{soft_bg};width:36%;font-weight:600;color:{text_main};\">{safe(k)}</td>"
        f"<td style=\"padding:10px 12px;border:1px solid {border};color:{text_main};\">{v}</td></tr>"
        for k, v in rows
    )
    intro = intro_text or "Please review your upcoming interview information below."

    cta = ""
    if interview_link:
        esc_link = safe(interview_link)
        cta = (
            f'<p style="margin:18px 0 4px;">'
            f'<a href="{esc_link}" '
            f'style="display:inline-block;background:{brand};color:#ffffff;text-decoration:none;'
            f'padding:11px 16px;border-radius:10px;font-weight:600;font-size:14px;">{safe(cta_label)}</a>'
            f"</p>"
        )

    return f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:{text_main};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:{card_bg};border:1px solid {border};border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(90deg,#4f46e5,#7c3aed);padding:20px 24px;">
              <p style="margin:0;color:#e0e7ff;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;">{safe(eyebrow)}</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;line-height:1.3;">{safe(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 8px;">
              <p style="margin:0 0 10px;font-size:15px;">Hi {safe(candidate_name)},</p>
              <p style="margin:0 0 14px;color:{text_muted};font-size:14px;">
                {safe(intro)}
              </p>
              <div style="border:1px solid #c7d2fe;background:#eef2ff;border-radius:10px;padding:10px 12px;margin:0 0 14px;">
                <p style="margin:0;color:#3730a3;font-size:13px;font-weight:600;">
                  Time reminder: {_format_time(time_pkt)} PKT / {_format_time(time_est)} US Eastern
                </p>
              </div>
              <table style="border-collapse:collapse;width:100%;max-width:560px;margin:0 0 6px;">
                {body_rows}
              </table>
              {cta}
              <p style="margin:14px 0 0;color:{text_muted};font-size:13px;">
                If anything looks wrong, please reply to this email or contact your recruiter.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px;background:{soft_bg};border-top:1px solid {border};">
              <p style="margin:0;color:{text_muted};font-size:12px;">Sent by RizViz Analytics Portal</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
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
        title="Interview Scheduled",
        eyebrow="Interview Confirmation",
        intro_text="Great news! Your interview has been scheduled. Please review and keep these details handy.",
        cta_label="Open Meeting Link",
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


def send_interview_reminder_email(
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
    reminder_minutes: int,
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
        title=f"Interview starts in {reminder_minutes} minutes",
        eyebrow="Interview Reminder",
        intro_text=f"This is a reminder that your interview starts in {reminder_minutes} minutes.",
        cta_label="Join Now",
    )
    plain = (
        f"Hi {candidate_name},\n\n"
        f"Reminder: your interview starts in {reminder_minutes} minutes.\n\n"
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
    msg["Subject"] = f"Reminder: interview in {reminder_minutes} minutes — {company_name or 'Interview'}"
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

    logger.info("Sent interview reminder email (%s min) to %s", reminder_minutes, to_email)


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
) -> bool:
    """Send if SES + from address are configured; no-op if candidate has no email. Logs errors, does not raise."""
    if not to_email or not str(to_email).strip():
        logger.debug("Skipping interview email: no candidate email")
        return False
    if not settings.AWS_SES_FROM_EMAIL:
        logger.warning("Skipping interview email: AWS_SES_FROM_EMAIL not set")
        return False
    if not settings.AWS_SES_USERNAME or not settings.AWS_SES_PASSWORD:
        logger.warning("Skipping interview email: AWS_SES SMTP credentials not set")
        return False
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
        return True
    except Exception:
        logger.exception("Failed to send interview notification email")
        return False


def try_send_interview_reminder_email(
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
    reminder_minutes: int,
) -> bool:
    """Send reminder if SES is configured; no-op if candidate has no email. Logs errors, does not raise."""
    if not to_email or not str(to_email).strip():
        logger.debug("Skipping interview reminder: no candidate email")
        return False
    if not settings.AWS_SES_FROM_EMAIL:
        logger.warning("Skipping interview reminder: AWS_SES_FROM_EMAIL not set")
        return False
    if not settings.AWS_SES_USERNAME or not settings.AWS_SES_PASSWORD:
        logger.warning("Skipping interview reminder: AWS_SES SMTP credentials not set")
        return False
    try:
        send_interview_reminder_email(
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
            reminder_minutes=reminder_minutes,
        )
        return True
    except Exception:
        logger.exception("Failed to send interview reminder email")
        return False

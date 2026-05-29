"""Send transactional email via AWS SES SMTP or Resend, controlled by EMAIL_PROVIDER in .env."""

from __future__ import annotations

import html as html_module
import logging
import smtplib
import socket
import ssl
from datetime import date, time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import TYPE_CHECKING, Optional

import httpx

if TYPE_CHECKING:
    from app.config import Settings

logger = logging.getLogger(__name__)


# ── Shared helpers ────────────────────────────────────────────────────────────

def _email_configured(settings: "Settings") -> bool:
    """Return True when the active email provider has all required credentials."""
    provider = (settings.EMAIL_PROVIDER or "ses").lower()
    if not settings.AWS_SES_FROM_EMAIL:
        return False
    if provider == "resend":
        return bool(settings.RESEND_API_KEY)
    return bool(settings.AWS_SES_USERNAME and settings.AWS_SES_PASSWORD)


class _IPv4SMTP(smtplib.SMTP):
    """smtplib.SMTP subclass that forces IPv4 resolution.

    macOS Python 3.12 tries AAAA first for SES hostnames; the query returns
    EAI_NONAME even though A records exist, crashing before a TCP connection
    is established.  Resolving with AF_INET explicitly avoids the issue while
    still using the hostname for TLS SNI and certificate validation.
    """

    def _get_socket(self, host, port, timeout):
        addrs = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
        ip = addrs[0][4][0]
        return socket.create_connection((ip, port), timeout)


def _send_via_ses(
    settings: "Settings",
    *,
    to_email: str,
    subject: str,
    html: str,
    plain: str,
) -> None:
    if not settings.AWS_SES_USERNAME or not settings.AWS_SES_PASSWORD:
        raise RuntimeError("AWS SES SMTP credentials are not set")
    host = f"email-smtp.{settings.AWS_REGION}.amazonaws.com"
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.AWS_SES_FROM_EMAIL
    msg["To"] = to_email
    msg.attach(MIMEText(plain, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    with _IPv4SMTP(host, 587, timeout=30) as server:
        server.starttls(context=ssl.create_default_context())
        server.login(settings.AWS_SES_USERNAME, settings.AWS_SES_PASSWORD)
        server.send_message(msg)


def _send_via_resend(
    settings: "Settings",
    *,
    to_email: str,
    subject: str,
    html: str,
    plain: str,
) -> None:
    if not settings.RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY is not set")
    resp = httpx.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "from": settings.AWS_SES_FROM_EMAIL,
            "to": [to_email],
            "subject": subject,
            "html": html,
            "text": plain,
        },
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Resend API error {resp.status_code}: {resp.text}")


def _dispatch_email(
    settings: "Settings",
    *,
    to_email: str,
    subject: str,
    html: str,
    plain: str,
) -> None:
    """Route to the active email provider."""
    provider = (settings.EMAIL_PROVIDER or "ses").lower()
    if provider == "resend":
        _send_via_resend(settings, to_email=to_email, subject=subject, html=html, plain=plain)
    else:
        _send_via_ses(settings, to_email=to_email, subject=subject, html=html, plain=plain)


def _format_date(d: Optional[date]) -> str:
    if not d:
        return "TBD"
    return d.strftime("%B %d, %Y")


def _format_time(t: Optional[time]) -> str:
    if not t:
        return "—"
    return t.strftime("%I:%M %p")


def make_presigned_doc_url(settings: "Settings", doc_url: Optional[str], expiry: int = 604800) -> Optional[str]:
    """Return a pre-signed GET URL (default 7 days) for a private S3 document. Falls back to the raw URL on error."""
    if not doc_url or not doc_url.strip():
        return None
    try:
        import boto3
        from urllib.parse import urlparse
        key = urlparse(doc_url).path.lstrip("/")
        if not key or not settings.AWS_S3_BUCKET_NAME:
            return doc_url
        s3 = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.effective_aws_access_key_id,
            aws_secret_access_key=settings.effective_aws_secret_access_key,
        )
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.AWS_S3_BUCKET_NAME, "Key": key},
            ExpiresIn=expiry,
        )
    except Exception:
        logger.warning("Failed to generate presigned URL for %s; using raw URL", doc_url)
        return doc_url


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
    salary_range: Optional[str] = None,
    interview_doc_url: Optional[str] = None,
    bd_name: Optional[str] = None,
    resume_profile_name: Optional[str] = None,
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
    ]
    if salary_range:
        rows.append(("Salary Range", safe(salary_range)))
    rows += [
        ("Round", safe(round_name)),
        ("Date", safe(_format_date(interview_date))),
        ("Time (US Eastern)", safe(_format_time(time_est))),
        ("Time (PKT)", safe(_format_time(time_pkt))),
        ("Format", "Phone call" if is_phone_call else "Video / other"),
    ]
    if resume_profile_name:
        rows.append(("Resume Profile", safe(resume_profile_name)))
    if interviewer:
        rows.append(("Interviewer", safe(interviewer)))
    if bd_name:
        rows.append(("Recruiter Contact", safe(bd_name)))
    if interview_link:
        esc_link = safe(interview_link)
        rows.append(("Meeting Link", f'<a href="{esc_link}" style="color:{brand};">{esc_link}</a>'))

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

    doc_section = ""
    if interview_doc_url:
        esc_doc = safe(interview_doc_url)
        doc_section = (
            f'<div style="margin:16px 0 4px;padding:14px 16px;border:1px solid #c7d2fe;background:#eef2ff;border-radius:10px;">'
            f'<p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#3730a3;">Interview Document</p>'
            f'<a href="{esc_doc}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;'
            f'padding:9px 14px;border-radius:8px;font-weight:600;font-size:13px;">&#8681; Download Document</a>'
            f'<p style="margin:8px 0 0;font-size:11px;color:{text_muted};">This download link expires in 7 days.</p>'
            f'</div>'
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
              {doc_section}
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


def welcome_notification_html(
    *,
    full_name: str,
    email: str,
    password: str,
    app_link: str,
    title: str = "Welcome to RizViz Analytics Portal",
) -> str:
    safe = html_module.escape
    brand = "#4f46e5"
    card_bg = "#ffffff"
    soft_bg = "#f8fafc"
    border = "#e2e8f0"
    text_main = "#0f172a"
    text_muted = "#64748b"

    return f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:{text_main};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:{card_bg};border:1px solid {border};border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(90deg,#4f46e5,#7c3aed);padding:24px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;line-height:1.3;font-weight:700;">{safe(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 16px;font-size:16px;font-weight:600;">Hi {safe(full_name)},</p>
              <p style="margin:0 0 16px;font-size:15px;color:{text_main};">
                Your account has been created on the RizViz Analytics Portal. You can now log in using the credentials below:
              </p>
              
              <div style="background:{soft_bg};border:1px solid {border};border-radius:10px;padding:16px;margin-bottom:20px;">
                <table width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:4px 0;font-size:14px;color:{text_muted};width:80px;">Email:</td>
                    <td style="padding:4px 0;font-size:14px;font-weight:600;color:{text_main};">{safe(email)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;font-size:14px;color:{text_muted};">Password:</td>
                    <td style="padding:4px 0;font-size:14px;font-weight:600;color:#4f46e5;font-family:monospace;">{safe(password)}</td>
                  </tr>
                </table>
              </div>

              <p style="margin:0 0 20px;font-size:14px;color:{text_muted};">
                <strong>Important:</strong> You will be required to change your password upon your first login for security reasons.
              </p>

              <div style="margin-bottom:24px;">
                <a href="{safe(app_link)}" 
                   style="display:inline-block;background:{brand};color:#ffffff;text-decoration:none;
                   padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px;box-shadow:0 4px 6px -1px rgba(79,70,229,0.2);">
                  Log in to Portal
                </a>
              </div>

              <p style="margin:0;font-size:14px;color:{text_muted};">
                If you have any questions, please reach out to the administrator.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:{soft_bg};border-top:1px solid {border};">
              <p style="margin:0;color:{text_muted};font-size:12px;text-align:center;">&copy; 2026 RizViz Analytics. All rights reserved.</p>
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
    salary_range: Optional[str] = None,
    interview_doc_url: Optional[str] = None,
    bd_name: Optional[str] = None,
    resume_profile_name: Optional[str] = None,
) -> None:
    """Raise on send failure; caller should catch and log."""
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
        salary_range=salary_range,
        interview_doc_url=interview_doc_url,
        bd_name=bd_name,
        resume_profile_name=resume_profile_name,
        title="Interview Scheduled",
        eyebrow="Interview Confirmation",
        intro_text="Great news! Your interview has been scheduled. Please review and keep these details handy.",
        cta_label="Open Meeting Link",
    )
    plain = (
        f"Hi {candidate_name},\n\n"
        f"Company: {company_name}\n"
        f"Role: {role}\n"
    )
    if salary_range:
        plain += f"Salary Range: {salary_range}\n"
    plain += (
        f"Round: {round_name}\n"
        f"Date: {_format_date(interview_date)}\n"
        f"Time (EST): {_format_time(time_est)}\n"
        f"Time (PKT): {_format_time(time_pkt)}\n"
        f"Format: {'Phone call' if is_phone_call else 'Video / other'}\n"
    )
    if resume_profile_name:
        plain += f"Resume Profile: {resume_profile_name}\n"
    if interviewer:
        plain += f"Interviewer: {interviewer}\n"
    if bd_name:
        plain += f"Recruiter Contact: {bd_name}\n"
    if interview_link:
        plain += f"Meeting Link: {interview_link}\n"
    if interview_doc_url:
        plain += f"Interview Document: {interview_doc_url}\n(Link expires in 7 days)\n"
    _dispatch_email(
        settings,
        to_email=to_email,
        subject=f"Interview scheduled — {company_name or 'Interview'}",
        html=html,
        plain=plain,
    )
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
    salary_range: Optional[str] = None,
    interview_doc_url: Optional[str] = None,
    bd_name: Optional[str] = None,
    resume_profile_name: Optional[str] = None,
) -> None:
    """Raise on send failure; caller should catch and log."""
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
        salary_range=salary_range,
        interview_doc_url=interview_doc_url,
        bd_name=bd_name,
        resume_profile_name=resume_profile_name,
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
    )
    if salary_range:
        plain += f"Salary Range: {salary_range}\n"
    plain += (
        f"Round: {round_name}\n"
        f"Date: {_format_date(interview_date)}\n"
        f"Time (EST): {_format_time(time_est)}\n"
        f"Time (PKT): {_format_time(time_pkt)}\n"
        f"Format: {'Phone call' if is_phone_call else 'Video / other'}\n"
    )
    if resume_profile_name:
        plain += f"Resume Profile: {resume_profile_name}\n"
    if interviewer:
        plain += f"Interviewer: {interviewer}\n"
    if bd_name:
        plain += f"Recruiter Contact: {bd_name}\n"
    if interview_link:
        plain += f"Meeting Link: {interview_link}\n"
    if interview_doc_url:
        plain += f"Interview Document: {interview_doc_url}\n(Link expires in 7 days)\n"
    _dispatch_email(
        settings,
        to_email=to_email,
        subject=f"Reminder: interview in {reminder_minutes} minutes — {company_name or 'Interview'}",
        html=html,
        plain=plain,
    )
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
    salary_range: Optional[str] = None,
    interview_doc_url: Optional[str] = None,
    bd_name: Optional[str] = None,
    resume_profile_name: Optional[str] = None,
) -> bool:
    """Send if email provider is configured; no-op if candidate has no email. Logs errors, does not raise."""
    if not to_email or not str(to_email).strip():
        logger.debug("Skipping interview email: no candidate email")
        return False
    if not _email_configured(settings):
        logger.warning("Skipping interview email: email provider not configured (EMAIL_PROVIDER=%s)", settings.EMAIL_PROVIDER)
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
            salary_range=salary_range,
            interview_doc_url=interview_doc_url,
            bd_name=bd_name,
            resume_profile_name=resume_profile_name,
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
    salary_range: Optional[str] = None,
    interview_doc_url: Optional[str] = None,
    bd_name: Optional[str] = None,
    resume_profile_name: Optional[str] = None,
) -> bool:
    """Send reminder if email provider is configured; no-op if candidate has no email. Logs errors, does not raise."""
    if not to_email or not str(to_email).strip():
        logger.debug("Skipping interview reminder: no candidate email")
        return False
    if not _email_configured(settings):
        logger.warning("Skipping interview reminder: email provider not configured (EMAIL_PROVIDER=%s)", settings.EMAIL_PROVIDER)
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
            salary_range=salary_range,
            interview_doc_url=interview_doc_url,
            bd_name=bd_name,
            resume_profile_name=resume_profile_name,
        )
        return True
    except Exception:
        logger.exception("Failed to send interview reminder email")
        return False


def send_welcome_email(
    settings: "Settings",
    *,
    to_email: str,
    full_name: str,
    password: str,
) -> None:
    """Raise on send failure; caller should catch and log."""
    app_link = settings.CLIENT_URL
    html = welcome_notification_html(
        full_name=full_name,
        email=to_email,
        password=password,
        app_link=app_link,
    )
    plain = (
        f"Hi {full_name},\n\n"
        f"Welcome to RizViz Analytics Portal! Your account has been created.\n\n"
        f"Log in at: {app_link}\n"
        f"Email: {to_email}\n"
        f"Password: {password}\n\n"
        f"You will be required to change your password upon your first login."
    )
    _dispatch_email(
        settings,
        to_email=to_email,
        subject="Welcome to RizViz Analytics Portal",
        html=html,
        plain=plain,
    )
    logger.info("Sent welcome email to %s", to_email)


def try_send_welcome_email(
    settings: "Settings",
    *,
    to_email: str,
    full_name: str,
    password: str,
) -> bool:
    """Logs errors, does not raise."""
    if not _email_configured(settings):
        logger.warning("Skipping welcome email: email provider not configured (EMAIL_PROVIDER=%s)", settings.EMAIL_PROVIDER)
        return False
    try:
        send_welcome_email(settings, to_email=to_email, full_name=full_name, password=password)
        return True
    except Exception:
        logger.exception("Failed to send welcome email to %s", to_email)
        return False


def password_reset_html(*, full_name: str, reset_link: str) -> str:
    safe = html_module.escape
    brand = "#4f46e5"
    card_bg = "#ffffff"
    soft_bg = "#f8fafc"
    border = "#e2e8f0"
    text_main = "#0f172a"
    text_muted = "#64748b"

    return f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:{text_main};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:{card_bg};border:1px solid {border};border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(90deg,#4f46e5,#7c3aed);padding:24px;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;line-height:1.3;font-weight:700;">Reset Your Password</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 16px;font-size:16px;font-weight:600;">Hi {safe(full_name)},</p>
              <p style="margin:0 0 16px;font-size:15px;color:{text_main};">
                We received a request to reset the password for your account. Click the button below to set a new password.
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:{text_muted};">
                This link will expire in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email.
              </p>
              <div style="margin-bottom:24px;">
                <a href="{safe(reset_link)}"
                   style="display:inline-block;background:{brand};color:#ffffff;text-decoration:none;
                   padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px;box-shadow:0 4px 6px -1px rgba(79,70,229,0.2);">
                  Reset Password
                </a>
              </div>
              <p style="margin:0 0 8px;font-size:13px;color:{text_muted};">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin:0;font-size:13px;color:{brand};word-break:break-all;">{safe(reset_link)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;background:{soft_bg};border-top:1px solid {border};">
              <p style="margin:0;color:{text_muted};font-size:12px;text-align:center;">&copy; 2026 RizViz Analytics. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def send_password_reset_email(
    settings: "Settings",
    *,
    to_email: str,
    full_name: str,
    reset_link: str,
) -> None:
    """Raise on send failure; caller should catch and log."""
    html = password_reset_html(full_name=full_name, reset_link=reset_link)
    plain = (
        f"Hi {full_name},\n\n"
        f"We received a request to reset your password.\n\n"
        f"Reset your password here (expires in 1 hour):\n{reset_link}\n\n"
        f"If you did not request this, you can safely ignore this email."
    )
    _dispatch_email(
        settings,
        to_email=to_email,
        subject="Reset your RizViz Analytics Portal password",
        html=html,
        plain=plain,
    )
    logger.info("Sent password reset email to %s", to_email)


def unresponsive_followup_html(
    *,
    recipient_name: str,
    company_name: str,
    role: str,
    candidate_name: Optional[str],
    days_unresponsive: int,
    portal_url: str,
) -> str:
    safe = html_module.escape
    card_bg = "#ffffff"
    soft_bg = "#fffbeb"
    border = "#fde68a"
    text_main = "#0f172a"
    text_muted = "#64748b"
    accent = "#d97706"

    candidate_row = (
        f"<tr><td style=\"padding:10px 12px;border:1px solid #fde68a;background:{soft_bg};width:36%;font-weight:600;color:{text_main};\">Candidate</td>"
        f"<td style=\"padding:10px 12px;border:1px solid #fde68a;color:{text_main};\">{safe(candidate_name)}</td></tr>"
        if candidate_name else ""
    )

    rows_html = (
        f"<tr><td style=\"padding:10px 12px;border:1px solid #fde68a;background:{soft_bg};width:36%;font-weight:600;color:{text_main};\">Company</td>"
        f"<td style=\"padding:10px 12px;border:1px solid #fde68a;color:{text_main};\">{safe(company_name)}</td></tr>"
        f"<tr><td style=\"padding:10px 12px;border:1px solid #fde68a;background:{soft_bg};width:36%;font-weight:600;color:{text_main};\">Role</td>"
        f"<td style=\"padding:10px 12px;border:1px solid #fde68a;color:{text_main};\">{safe(role)}</td></tr>"
        f"{candidate_row}"
        f"<tr><td style=\"padding:10px 12px;border:1px solid #fde68a;background:{soft_bg};width:36%;font-weight:600;color:{text_main};\">Days Unresponsive</td>"
        f"<td style=\"padding:10px 12px;border:1px solid #fde68a;color:#b91c1c;font-weight:600;\">{days_unresponsive} days</td></tr>"
    )

    return f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:{text_main};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:{card_bg};border:1px solid #fde68a;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(90deg,#d97706,#f59e0b);padding:20px 24px;">
              <p style="margin:0;color:#fef3c7;font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;">Action Required</p>
              <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;line-height:1.3;">Lead Follow-Up Reminder</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 8px;">
              <p style="margin:0 0 10px;font-size:15px;">Hi {safe(recipient_name)},</p>
              <p style="margin:0 0 14px;color:{text_muted};font-size:14px;">
                A lead has been in <strong>Unresponsive</strong> status for <strong>{days_unresponsive} days</strong> and requires a follow-up. Please reach out to re-engage or update the lead status.
              </p>
              <div style="border:1px solid #fde68a;background:{soft_bg};border-radius:10px;padding:10px 12px;margin:0 0 14px;">
                <p style="margin:0;color:{accent};font-size:13px;font-weight:600;">
                  &#9888; This lead will be automatically marked as Dead after 30 days of no activity.
                </p>
              </div>
              <table style="border-collapse:collapse;width:100%;max-width:560px;margin:0 0 6px;">
                {rows_html}
              </table>
              <p style="margin:18px 0 4px;">
                <a href="{safe(portal_url)}"
                   style="display:inline-block;background:{accent};color:#ffffff;text-decoration:none;
                   padding:11px 16px;border-radius:10px;font-weight:600;font-size:14px;">
                  View Lead in Portal
                </a>
              </p>
              <p style="margin:14px 0 0;color:{text_muted};font-size:13px;">
                If this lead has already been addressed, please update the status in the portal.
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


def send_unresponsive_followup_email(
    settings: "Settings",
    *,
    to_email: str,
    recipient_name: str,
    company_name: str,
    role: str,
    candidate_name: Optional[str],
    days_unresponsive: int,
    portal_url: str,
) -> None:
    """Raise on send failure; caller should catch and log."""
    html = unresponsive_followup_html(
        recipient_name=recipient_name,
        company_name=company_name,
        role=role,
        candidate_name=candidate_name,
        days_unresponsive=days_unresponsive,
        portal_url=portal_url,
    )
    candidate_line = f"Candidate: {candidate_name}\n" if candidate_name else ""
    plain = (
        f"Hi {recipient_name},\n\n"
        f"Action required: A lead has been Unresponsive for {days_unresponsive} days.\n\n"
        f"Company: {company_name}\n"
        f"Role: {role}\n"
        f"{candidate_line}"
        f"\nPlease follow up or update the lead status in the portal: {portal_url}\n\n"
        f"Note: This lead will be automatically marked as Dead after 30 days of no activity."
    )
    _dispatch_email(
        settings,
        to_email=to_email,
        subject=f"Follow-up required: {company_name} lead unresponsive for {days_unresponsive} days",
        html=html,
        plain=plain,
    )
    logger.info("Sent unresponsive follow-up email to %s", to_email)


def try_send_unresponsive_followup_email(
    settings: "Settings",
    *,
    to_email: Optional[str],
    recipient_name: str,
    company_name: str,
    role: str,
    candidate_name: Optional[str],
    days_unresponsive: int,
    portal_url: str,
) -> bool:
    """Send if email provider is configured and recipient has an email. Logs errors, does not raise."""
    if not to_email or not str(to_email).strip():
        logger.debug("Skipping unresponsive follow-up email: no recipient email")
        return False
    if not _email_configured(settings):
        logger.warning("Skipping unresponsive follow-up email: email provider not configured (EMAIL_PROVIDER=%s)", settings.EMAIL_PROVIDER)
        return False
    try:
        send_unresponsive_followup_email(
            settings,
            to_email=to_email.strip(),
            recipient_name=recipient_name,
            company_name=company_name,
            role=role,
            candidate_name=candidate_name,
            days_unresponsive=days_unresponsive,
            portal_url=portal_url,
        )
        return True
    except Exception:
        logger.exception("Failed to send unresponsive follow-up email to %s", to_email)
        return False


def try_send_password_reset_email(
    settings: "Settings",
    *,
    to_email: str,
    full_name: str,
    reset_link: str,
) -> bool:
    """Logs errors, does not raise."""
    if not _email_configured(settings):
        logger.warning("Skipping password reset email: email provider not configured (EMAIL_PROVIDER=%s)", settings.EMAIL_PROVIDER)
        return False
    try:
        send_password_reset_email(settings, to_email=to_email, full_name=full_name, reset_link=reset_link)
        return True
    except Exception:
        logger.exception("Failed to send password reset email to %s", to_email)
        return False

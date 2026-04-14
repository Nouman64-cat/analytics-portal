from datetime import date as date_type
from typing import Optional

# Stored on interview.status — outcomes that are only meaningful at lead level (not round-level).
# "rejected" is allowed on a round when that step received a rejection; lead derives from latest round.
LEAD_ONLY_INTERVIEW_STATUSES = frozenset({"dropped", "closed", "dead"})


def sanitize_status_for_interview_compute(status: Optional[str]) -> Optional[str]:
    """Strip lead-level outcomes so interview rows do not carry them in computed status."""
    if not status or not status.strip():
        return None
    if status.strip().lower() in LEAD_ONLY_INTERVIEW_STATUSES:
        return None
    return status


def computed_status_for_interview_display(
    status: Optional[str], interview_date: Optional[date_type]
) -> str:
    """
    Badge/status for a single interview round. Lead-only slugs are stripped before compute;
    explicit round outcomes (e.g. Rejected) are kept.
    """
    s = sanitize_status_for_interview_compute(status)
    return compute_status(s, interview_date)


def compute_status(status: Optional[str], interview_date: Optional[date_type]) -> str:
    """
    Derive the effective interview status from the raw DB status and interview date.

    Rules (evaluated in order):
    - Non-empty status stored in DB → return it as-is.
    - No status + future date         → "Upcoming"
    - No status + date ≥ 30 days ago  → "Dead"
    - Anything else with no status    → "Unresponsed"
    """
    if not status or not status.strip():
        if interview_date:
            today = date_type.today()
            if interview_date > today:
                return "Upcoming"
            days_past = (today - interview_date).days
            if days_past >= 30:
                return "Dead"
        return "Unresponsed"
    return status

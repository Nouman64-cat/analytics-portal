from datetime import date as date_type
from typing import Optional


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

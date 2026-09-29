"""Resolve when an interview actually happens in Pakistan time.

interview_date is the US Eastern date: the interview form derives time_pkt from time_est by
adding 9/10h and wrapping at midnight, so an afternoon-EST interview falls on the *next* PKT day.
"""

from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from app.models.interview import Interview

PKT = timezone(timedelta(hours=5))
US_EASTERN = ZoneInfo("America/New_York")


def pkt_moment(i: Interview) -> tuple[date, Optional[time]]:
    """The interview's actual PKT date and time (time is None when unscheduled)."""
    if i.time_est and i.time_pkt:
        # PKT is always 9-10h ahead of US Eastern, so a PKT clock earlier than the EST clock
        # means it wrapped past midnight into the next day.
        rolled = i.time_pkt < i.time_est
        return i.interview_date + timedelta(days=1 if rolled else 0), i.time_pkt
    if i.time_est:
        pkt = datetime.combine(i.interview_date, i.time_est, US_EASTERN).astimezone(PKT)
        return pkt.date(), pkt.time()
    return i.interview_date, i.time_pkt

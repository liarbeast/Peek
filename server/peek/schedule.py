"""When the frame wakes next.

The frame refreshes on a fixed interval, set in Settings. Wakes fall on round
clock times (on the hour, at midnight, Monday at midnight) in the server's
local time, so they don't drift with however long a wake takes.
"""

from __future__ import annotations

from datetime import datetime, timedelta

# Interval ids, in the order the Settings page lists them, with their length.
REFRESH_INTERVALS: dict[str, timedelta] = {
    "15m": timedelta(minutes=15),
    "30m": timedelta(minutes=30),
    "1h": timedelta(hours=1),
    "3h": timedelta(hours=3),
    "6h": timedelta(hours=6),
    "12h": timedelta(hours=12),
    "1d": timedelta(days=1),
    "1w": timedelta(weeks=1),
}
DEFAULT_REFRESH = "1h"

# Never ask the frame to sleep for less than this, so a wake that lands just
# before a boundary doesn't come straight back.
MIN_SLEEP = 60


def next_wake(refresh: str, now: datetime) -> datetime:
    """The first round time after `now` for this interval."""
    step = REFRESH_INTERVALS.get(refresh, REFRESH_INTERVALS[DEFAULT_REFRESH])
    if step == timedelta(weeks=1):
        start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    wake = start + step * ((now - start) // step + 1)
    if (wake - now).total_seconds() < MIN_SLEEP:
        wake += step
    return wake


def sleep_seconds(refresh: str, now: datetime | None = None) -> int:
    now = now or datetime.now()
    return round((next_wake(refresh, now) - now).total_seconds())

"""When the frame wakes next, and what it shows then.

The frame refreshes on a fixed interval, set in Settings. Wakes fall on round
clock times (on the hour, at midnight, Monday at midnight) in the server's
local time, so they don't drift with however long a wake takes.

Each wake shows the next item of the current category, in the category's item
order. When the "switch collection" interval has passed too (or, if so set,
once every item of the category has had its turn), it moves on to the next
active category first. A category filled from a data source is fetched on
every wake it's shown.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Callable

from . import db

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

# How often the frame moves on to the next category, in the order the Settings
# page lists them. Months start on the 1st at midnight; "finished" isn't a
# time but a lap through the category's items.
SWITCH_INTERVALS: dict[str, timedelta | None] = {
    "30m": timedelta(minutes=30),
    "1h": timedelta(hours=1),
    "8h": timedelta(hours=8),
    "1d": timedelta(days=1),
    "1w": timedelta(weeks=1),
    "1mo": None,
    "finished": None,
}



# Never ask the frame to sleep for less than this, so a wake that lands just
# before a boundary doesn't come straight back.
MIN_SLEEP = 60

# A wake up to this much early still counts as the round time it was meant
# for: the frame's clock runs a little fast or slow.
EARLY_WAKE = timedelta(minutes=2)


def period_start(interval: str, now: datetime) -> datetime:
    """The last round time at or before `now` for this interval."""
    if interval == "1mo":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    step = REFRESH_INTERVALS.get(interval) or SWITCH_INTERVALS.get(interval) or REFRESH_INTERVALS[DEFAULT_REFRESH]
    if step == timedelta(weeks=1):
        start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start + step * ((now - start) // step)


def next_switch(switch: str, refresh: str, now: datetime) -> datetime:
    """When the frame next moves on to another category: the first wake on or
    after the end of the current switch period ("finished" isn't a time)."""
    start = period_start(switch, now)
    if switch == "1mo":
        end = (start + timedelta(days=32)).replace(day=1)
    else:
        end = start + (SWITCH_INTERVALS.get(switch) or REFRESH_INTERVALS[DEFAULT_REFRESH])
    wake = period_start(refresh, end)
    return wake if wake == end else wake + REFRESH_INTERVALS.get(refresh, REFRESH_INTERVALS[DEFAULT_REFRESH])


def next_wake(refresh: str, now: datetime) -> datetime:
    """The first round time after `now` for this interval."""
    step = REFRESH_INTERVALS.get(refresh, REFRESH_INTERVALS[DEFAULT_REFRESH])
    wake = period_start(refresh, now) + step
    if (wake - now).total_seconds() < MIN_SLEEP:
        wake += step
    return wake


def sleep_seconds(refresh: str, now: datetime | None = None) -> int:
    now = now or datetime.now()
    return round((next_wake(refresh, now) - now).total_seconds())


def next_in_order(store: db.Store, current_category: int | None) -> dict | None:
    """The category the frame moves on to after `current_category` with
    "In order": the next one in rotation that has something to show."""
    pool = [c for c in store.categories() if c["enabled"]
            if c["source"] or any(i["enabled"] for i in store.items(c["id"]))]
    ids = [c["id"] for c in pool]
    if not pool:
        return None
    return pool[(ids.index(current_category) + 1) % len(pool) if current_category in ids else 0]


def next_item(store: db.Store, current_category: int | None, switch: bool, lap: int | None = None,
              fetch: Callable[[dict], None] | None = None, order: str = "in_order",
              shown_this_round: list[int] | tuple = ()) -> dict | None:
    """The item to show next: from the current category, or from the next
    active one when `switch` is set (or the current one is off or empty).
    The next one is the one after it in the categories' order, or with
    `order` "shuffle", a random one that hasn't had its turn this round
    (`shown_this_round`); once all have, a new round starts.
    With `lap`, the number of its items shown in a row, it also switches once
    that reaches how many items the category has. `fetch` brings a category
    filled from a data source up to date before its next item is picked.
    None when no active category has an item to show."""
    enabled = lambda c: [i for i in store.items(c["id"]) if i["enabled"]]  # noqa: E731
    pool = [(c, items) for c in store.categories() if c["enabled"] if (items := enabled(c)) or c["source"]]
    if not pool:
        return None
    ids = [c["id"] for c, _ in pool]
    if lap is not None and current_category in ids:
        switch = switch or lap >= len(pool[ids.index(current_category)][1])
    if current_category in ids and not switch:
        index = ids.index(current_category)
    elif order == "shuffle":
        others = [i for i in ids if i != current_category] or ids
        index = ids.index(random.choice([i for i in others if i not in shown_this_round] or others))
    else:
        index = (ids.index(current_category) + 1) % len(pool) if current_category in ids else 0
    category, items = pool[index]
    if fetch and category["source"]:
        fetch(category)
        items = enabled(category)
    if not items:
        return None
    if category["item_order"] == "random":
        return random.choice(items)
    if category["item_order"] == "shuffle":  # each item once, in a random order, then again
        fewest = min(i["times_shown"] for i in items)
        return random.choice([i for i in items if i["times_shown"] == fewest])
    last = max(items, key=lambda i: i["last_shown"] or "")
    return items[(items.index(last) + 1) % len(items)] if last["last_shown"] else items[0]

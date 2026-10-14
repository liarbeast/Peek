"""Collections filled from the web: a JSON address, read again once a day.

A source says where to fetch (the address may hold {YYYY}, {MM} and {DD},
filled in with the day's date, and {RANDOM:1-1025}, a new random number on
each fetch), where the list of entries sits in the
response, and which value of an entry goes in each field. Both are dotted
paths into the JSON, such as "selected" or "pages.0.thumbnail.source"; an
empty list path means the response itself (one object makes one item).
"""

from __future__ import annotations

import random
import re
from datetime import date

import httpx

HEADERS = {"User-Agent": "Peek e-paper frame (+https://github.com/liarbeast/Peek)"}


class SourceError(Exception):
    pass


def url_for(url: str, day: date) -> str:
    url = url.replace("{YYYY}", f"{day:%Y}").replace("{MM}", f"{day:%m}").replace("{DD}", f"{day:%d}")
    return re.sub(r"\{RANDOM:(\d+)-(\d+)\}", lambda m: str(random.randint(int(m[1]), int(m[2]))), url)


def pick(data, path: str):
    """The value at a dotted path, or None if it isn't there."""
    for part in filter(None, path.strip().split(".")):
        if isinstance(data, list) and part.isdigit() and int(part) < len(data):
            data = data[int(part)]
        elif isinstance(data, dict) and part in data:
            data = data[part]
        else:
            return None
    return data


def entries(data, source: dict) -> list[dict[str, str]]:
    """One {field key: text} per entry in a response; entries without any
    value are left out."""
    found = pick(data, source.get("items", ""))
    if isinstance(found, dict):
        found = [found]
    if not isinstance(found, list):
        raise SourceError(f"no list at “{source.get('items', '')}” in the response")
    rows = []
    for entry in found:
        row = {}
        for key, path in source.get("fields", {}).items():
            value = pick(entry, path) if path.strip() else None
            if value not in (None, "") and not isinstance(value, (dict, list)):
                row[key] = str(value)
        if row:
            rows.append(row)
    return rows


def load(url: str, day: date):
    """The JSON at an address, with the day's date filled in."""
    url = url_for(url, day)
    if not url.startswith(("http://", "https://")):
        raise SourceError("the address must start with http:// or https://")
    try:
        res = httpx.get(url, headers=HEADERS, timeout=15, follow_redirects=True)
        res.raise_for_status()
        data = res.json()
    except httpx.HTTPError as e:
        raise SourceError(f"couldn't load {url}: {e}") from e
    except ValueError as e:
        raise SourceError(f"{url} didn't return JSON") from e
    return data


def fetch(source: dict, day: date) -> list[dict[str, str]]:
    return entries(load(source["url"], day), source)


def lists(data, path: str = "", depth: int = 3) -> list[dict]:
    """Every list of entries (objects) in a response, with its path and length,
    longest first: the candidates for "List of entries"."""
    found = []
    if isinstance(data, list) and data and isinstance(data[0], dict):
        found.append({"path": path, "count": len(data)})
    elif isinstance(data, dict) and depth:
        for key, value in data.items():
            found += lists(value, f"{path}.{key}" if path else key, depth - 1)
    return sorted(found, key=lambda f: -f["count"])


def values(entry, path: str = "", depth: int = 4) -> list[dict]:
    """Every plain value in an entry, with its path and an example, to pick
    from for each field. Lists contribute their first element."""
    if isinstance(entry, dict) and depth:
        items = entry.items()
    elif isinstance(entry, list) and entry and depth:
        items = [("0", entry[0])]
    else:
        if entry in (None, "") or isinstance(entry, (dict, list)):
            return []
        return [{"path": path, "example": str(entry)}]
    return [v for key, value in items for v in values(value, f"{path}.{key}" if path else key, depth - 1)]


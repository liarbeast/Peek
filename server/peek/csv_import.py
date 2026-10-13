"""Reading CSV files into items: columns, type guesses and image downloads."""

from __future__ import annotations

import csv
import io
import re
from concurrent.futures import ThreadPoolExecutor

import httpx

from . import fields as fieldlib

MAX_ROWS = 5000
MAX_IMAGE_BYTES = 15 * 1024 * 1024

_NUMBER = re.compile(r"^-?\d+([.,]\d+)?$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$|^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$")
_URL = re.compile(r"^https?://\S+$", re.IGNORECASE)
_IMAGE_URL = re.compile(r"\.(png|jpe?g|gif|webp)(\?.*)?$", re.IGNORECASE)
_IMAGE_WORDS = ("image", "img", "photo", "picture", "sprite", "foto", "afbeelding", "plaatje", "thumbnail")


class CsvError(ValueError):
    pass


def parse(data: bytes) -> tuple[list[str], list[list[str]]]:
    """Return the header and rows of a CSV file.

    Accepts UTF-8 (with or without a byte order mark) and Windows-1252, and
    commas, semicolons (as Excel writes them in the Netherlands) or tabs.
    """
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp1252", errors="replace")
    if not text.strip():
        raise CsvError("the file is empty")
    try:
        dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    rows = [r for r in reader if any(cell.strip() for cell in r)]
    if not rows:
        raise CsvError("the file has no rows")
    header = [h.strip() for h in rows[0]]
    if not any(header):
        raise CsvError("the first row should name the columns")
    body = rows[1:]
    if len(body) > MAX_ROWS:
        raise CsvError(f"the file has {len(body)} rows; the most Peek imports at once is {MAX_ROWS}")
    width = len(header)
    body = [(r + [""] * width)[:width] for r in body]
    header = [h or f"Column {i + 1}" for i, h in enumerate(header)]
    return header, body


def guess_type(name: str, values: list[str]) -> str:
    """Guess a field type from a column's name and values."""
    values = [v.strip() for v in values if v.strip()]
    if not values:
        return "text"
    if all(_URL.match(v) for v in values):
        if any(word in name.lower() for word in _IMAGE_WORDS) or all(_IMAGE_URL.search(v) for v in values):
            return "image"
        return "link"
    if all(_NUMBER.match(v) for v in values):
        return "number"
    if all(_DATE.match(v) for v in values):
        return "date"
    if max(len(v) for v in values) > 80 or any("\n" in v for v in values):
        return "long_text"
    return "text"


def match_field(column: str, fields: list[dict]) -> str | None:
    """The key of the field a column name refers to, if any."""
    name = column.strip().lower()
    key = fieldlib.slug(column)
    for f in fields:
        if f["label"].strip().lower() == name or f["key"] == key:
            return f["key"]
    return None


def download_images(urls: list[str], allowed: dict[str, str]) -> dict[str, tuple[bytes, str] | None]:
    """Fetch image URLs in parallel. Returns url -> (bytes, extension) or None.

    `allowed` maps accepted content types to file extensions.
    """
    unique = sorted({u for u in urls if u})

    def fetch(client: httpx.Client, url: str) -> tuple[bytes, str] | None:
        if not _URL.match(url):
            return None
        try:
            with client.stream("GET", url) as res:
                res.raise_for_status()
                mime = res.headers.get("content-type", "").split(";")[0].strip().lower()
                if mime not in allowed:
                    return None
                body = b""
                for chunk in res.iter_bytes():
                    body += chunk
                    if len(body) > MAX_IMAGE_BYTES:
                        return None
                return body, allowed[mime]
        except httpx.HTTPError:
            return None

    headers = {"User-Agent": "Peek e-paper frame (+https://github.com/liarbeast/Peek)"}
    with httpx.Client(timeout=15, follow_redirects=True, headers=headers) as client:
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda u: fetch(client, u), unique))
    return dict(zip(unique, results))

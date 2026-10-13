"""Per-category fields: what each item in a category holds.

A category's fields are a list of {"key", "label", "type"}. The key names the
value in each item's data and the CSS class `.field-<key>`; the label is what
people see and can change freely.
"""

from __future__ import annotations

import re
import unicodedata

FIELD_TYPES = ("text", "image")

_KEY = re.compile(r"^[a-z][a-z0-9-]{0,39}$")


class FieldError(ValueError):
    pass


def slug(label: str) -> str:
    """A CSS-friendly key from a label: "Pokédex no." -> "pokedex-no"."""
    text = unicodedata.normalize("NFKD", label).encode("ascii", "ignore").decode().lower()
    key = re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:40].strip("-")
    if not key or not key[0].isalpha():
        key = f"field-{key}" if key else "field"
    return key


def unique_key(label: str, taken: set[str]) -> str:
    base = slug(label)
    key, n = base, 2
    while key in taken:
        key = f"{base[:36]}-{n}"
        n += 1
    return key


def normalize(fields: list[dict]) -> list[dict]:
    """Check a field list from the API and give new fields a key.

    Fields that already have a key keep it, so renaming a label never breaks
    CSS that targets `.field-<key>`.
    """
    out: list[dict] = []
    taken = {f["key"] for f in fields if f.get("key")}
    seen: set[str] = set()
    for f in fields:
        label = str(f.get("label", "")).strip()
        if not label:
            raise FieldError("every field needs a name")
        if len(label) > 60:
            raise FieldError(f"field name too long: {label[:20]}…")
        ftype = f.get("type", "text")
        if ftype not in FIELD_TYPES:
            raise FieldError(f"unknown field type: {ftype}")
        key = f.get("key") or unique_key(label, taken | seen)
        if not _KEY.match(key):
            raise FieldError(f"invalid field key: {key}")
        if key in seen:
            raise FieldError(f"two fields share the key {key}")
        seen.add(key)
        out.append({"key": key, "label": label, "type": ftype})
    if len(out) > 50:
        raise FieldError("a category can have at most 50 fields")
    return out


def image_keys(fields: list[dict]) -> list[str]:
    return [f["key"] for f in fields if f["type"] == "image"]

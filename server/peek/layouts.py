"""Fills a layout template with an item's fields to produce a page of HTML.

A layout has places ("slots") such as a main image or a title. Each category
chooses which of its fields goes in which place; fields without a place are
still drawn, as `.extra` lines, so custom CSS can show, hide or move them.
Every field's element carries `field field-<key> type-<type>` classes.
"""

from __future__ import annotations

import base64
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATES = ("photo", "quote", "sprite", "stack")

# What each layout shows, for the GUI. "slots" are its places, each taking an
# image field or any other field; "fields" are the fields a new category with
# this layout starts with. Every layout also sets the six panel colours as
# --black, --white, --yellow, --red, --blue and --green, and the page is
# 800x480 or 480x800, so custom CSS can use @media (orientation: portrait).
TEMPLATE_INFO = {
    "photo": {
        "label": "Photo",
        "description": "A full-screen photo with a caption bar.",
        "slots": [
            {"name": "image", "label": "Photo", "kind": "image"},
            {"name": "title", "label": "Caption", "kind": "text"},
        ],
        "fields": [
            {"key": "image", "label": "Image", "type": "image"},
            {"key": "title", "label": "Title", "type": "text"},
        ],
        "classes": [".photo", ".caption-bar", ".caption", ".extra"],
    },
    "quote": {
        "label": "Quote",
        "description": "Large text with its source.",
        "slots": [
            {"name": "text", "label": "Quote", "kind": "text"},
            {"name": "title", "label": "Source", "kind": "text"},
        ],
        "fields": [
            {"key": "text", "label": "Text", "type": "long_text"},
            {"key": "title", "label": "Title", "type": "text"},
        ],
        "classes": [".mark", ".text", ".source", ".extra"],
    },
    "sprite": {
        "label": "Sprite",
        "description": "Pixel art scaled up sharply, with a name, a subtitle and text.",
        "slots": [
            {"name": "image", "label": "Sprite", "kind": "image"},
            {"name": "subtitle", "label": "Subtitle", "kind": "text"},
            {"name": "title", "label": "Name", "kind": "text"},
            {"name": "text", "label": "Text", "kind": "text"},
        ],
        "fields": [
            {"key": "image", "label": "Image", "type": "image"},
            {"key": "title", "label": "Title", "type": "text"},
            {"key": "subtitle", "label": "Subtitle", "type": "text"},
            {"key": "text", "label": "Text", "type": "long_text"},
        ],
        "classes": [".sprite", ".subtitle", ".name", ".text", ".extra"],
    },
    "stack": {
        "label": "Stack",
        "description": "Every field in order, top to bottom. Shape it any way you like with CSS.",
        "slots": [],
        "fields": [
            {"key": "image", "label": "Image", "type": "image"},
            {"key": "title", "label": "Title", "type": "text"},
            {"key": "text", "label": "Text", "type": "long_text"},
        ],
        "classes": [".stack"],
    },
}

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html"]),
)


def data_uri(data: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def _fits(slot: dict, field: dict) -> bool:
    return (field["type"] == "image") == (slot["kind"] == "image")


def resolve_slots(template: str, fields: list[dict], chosen: dict) -> dict[str, str | None]:
    """Which field key fills each place of a layout.

    A place the category set explicitly keeps its choice (None leaves it
    empty). Otherwise it takes the field with the same key, then the first
    fitting field nothing else uses yet.
    """
    slots = TEMPLATE_INFO[template]["slots"]
    by_key = {f["key"]: f for f in fields}
    result: dict[str, str | None] = {}
    for slot in slots:
        name = slot["name"]
        if name in chosen:
            key = chosen[name]
            result[name] = key if key in by_key and _fits(slot, by_key[key]) else None
    used = {k for k in result.values() if k}
    for slot in slots:
        name = slot["name"]
        if name in result:
            continue
        candidates = [by_key[name]] if name in by_key else []
        candidates += [f for f in fields if f["key"] != name]
        pick = next((f for f in candidates if f["key"] not in used and _fits(slot, f)), None)
        result[name] = pick["key"] if pick else None
        if pick:
            used.add(pick["key"])
    return result


def build(template: str, fields: list[dict], values: dict, slots: dict | None = None,
          custom_css: str = "", size: tuple[int, int] = (800, 480)) -> str:
    """Render a layout.

    `values` maps field keys to what to show: text, or a data URI for images.
    """
    if template not in TEMPLATES:
        raise ValueError(f"unknown template: {template}")

    def entry(f: dict) -> dict:
        return {**f, "value": values.get(f["key"]) or ""}

    placed = resolve_slots(template, fields, slots or {})
    by_key = {f["key"]: f for f in fields}
    slot_entries = {name: entry(by_key[key]) if key else None for name, key in placed.items()}
    used = {k for k in placed.values() if k}
    extra = [entry(f) for f in fields if f["key"] not in used and values.get(f["key"])]
    width, height = size
    return _env.get_template(f"{template}.html").render(
        slot=slot_entries,
        extra=extra,
        all_fields=[entry(f) for f in fields],
        custom_css=custom_css,
        width=width,
        height=height,
    )

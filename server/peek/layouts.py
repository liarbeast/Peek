"""Fills a layout template with an item's fields to produce a page of HTML."""

from __future__ import annotations

import base64
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATES = ("photo", "quote", "sprite")

# What each template shows, for the GUI. "classes" are the elements custom
# CSS can target; every template also sets the six panel colours as
# --black, --white, --yellow, --red, --blue and --green, and the page is
# 800x480 or 480x800, so custom CSS can use @media (orientation: portrait).
TEMPLATE_INFO = {
    "photo": {
        "label": "Photo",
        "description": "A full-screen photo with the title as a caption bar.",
        "fields": ["image", "title"],
        "classes": [".photo", ".caption"],
    },
    "quote": {
        "label": "Quote",
        "description": "Large text with the title as its source.",
        "fields": ["text", "title"],
        "classes": [".mark", ".text", ".source"],
    },
    "sprite": {
        "label": "Sprite",
        "description": "Pixel art scaled up sharply, with a name, a subtitle and text.",
        "fields": ["image", "title", "subtitle", "text"],
        "classes": [".sprite", ".subtitle", ".name", ".text"],
    },
}

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html"]),
)


def data_uri(data: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def build(template: str, fields: dict, custom_css: str = "", size: tuple[int, int] = (800, 480)) -> str:
    if template not in TEMPLATES:
        raise ValueError(f"unknown template: {template}")
    width, height = size
    return _env.get_template(f"{template}.html").render(
        **fields, custom_css=custom_css, width=width, height=height
    )

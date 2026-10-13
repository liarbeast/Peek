"""Fills the layout with an item's fields to produce a page of HTML.

There is one layout, Stack: every field in order, each element carrying
`field field-<key> type-<type>` classes so custom CSS can style, move or hide
any of them.
"""

from __future__ import annotations

import base64
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATES = ("stack",)

# What each layout offers, for the GUI. "fields" are the fields a new
# category starts with. Every layout also sets the six panel colours as
# --black, --white, --yellow, --red, --blue and --green, and the page is
# 800x480 or 480x800, so custom CSS can use @media (orientation: portrait).
TEMPLATE_INFO = {
    "stack": {
        "label": "Stack",
        "description": "Every field in order, top to bottom. Shape it any way you like with CSS.",
        "fields": [
            {"key": "image", "label": "Image", "type": "image"},
            {"key": "title", "label": "Title", "type": "text"},
            {"key": "subtext", "label": "Subtext", "type": "text"},
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


def build(template: str, fields: list[dict], values: dict, custom_css: str = "",
          size: tuple[int, int] = (800, 480), pixelate: bool = False) -> str:
    """Render a layout.

    `values` maps field keys to what to show: text, or a data URI for images.
    `pixelate` draws images as pixel art: hard edges when enlarged, not dithered.
    """
    if template not in TEMPLATES:
        raise ValueError(f"unknown template: {template}")
    width, height = size
    return _env.get_template(f"{template}.html").render(
        fields=[{**f, "value": values.get(f["key"]) or ""} for f in fields],
        custom_css=custom_css,
        pixelate=pixelate,
        width=width,
        height=height,
    )

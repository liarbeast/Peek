"""Fills the layout with an item's fields to produce a page of HTML.

There is one layout, Canvas: every field sits in a box of its own, placed by
dragging it in the app. Each element carries `field field-<key> type-<type>`
classes and a `data-field` attribute.
"""

from __future__ import annotations

import base64
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATES = ("canvas",)

# What each layout offers, for the GUI. "fields" are the fields a new
# category starts with.
TEMPLATE_INFO = {
    "canvas": {
        "label": "Canvas",
        "description": "Every field in a box of its own, placed by dragging.",
        "fields": [
            {"key": "image", "label": "Image", "type": "image"},
            {"key": "title", "label": "Title", "type": "text"},
            {"key": "subtext", "label": "Subtext", "type": "text"},
        ],
    },
}

# The page each orientation is drawn on.
SIZES = {"landscape": (800, 480), "portrait": (480, 800)}

MARGIN = 40
GAP = 16

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html"]),
)


def data_uri(data: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def default_positions(fields: list[dict], size: tuple[int, int]) -> dict[str, dict]:
    """Where fields go until they are dragged somewhere: one under the other,
    full width and centred, each attached below the one before so the spacing
    holds whatever the text. The first text field is the title."""
    width, height = size
    boxes, y, previous, titled = {}, MARGIN, None, False
    for f in fields:
        box = {"x": MARGIN, "y": y, "w": width - 2 * MARGIN, "align": "center"}
        if f["type"] == "image":
            box.update(h=round(height * 0.45), valign="middle")
        else:
            box.update(h=60, size=28 if titled else 44, **({} if titled else {"bold": True}))
            titled = True
        if previous:
            box.update(below=previous, gap=GAP)
        boxes[f["key"]] = box
        y += box["h"] + GAP
        previous = f["key"]
    return boxes


def complete_positions(fields: list[dict], positions: dict) -> dict:
    """Positions for every orientation with a box for every field: the saved
    ones, and the default for any field that was never placed."""
    return {
        orientation: {**default_positions(fields, size), **(positions or {}).get(orientation, {})}
        for orientation, size in SIZES.items()
    }


def default_image_box(size: tuple[int, int]) -> dict:
    """Where a style image goes until it is dragged: over the whole page,
    behind the fields."""
    width, height = size
    return {"x": 0, "y": 0, "w": width, "h": height, "z": -1}


def build(template: str, fields: list[dict], values: dict, size: tuple[int, int] = (800, 480),
          pixelate: bool = False, positions: dict[str, dict] | None = None, font_css: str = "",
          images: list[dict] | None = None) -> str:
    """Render a layout.

    `values` maps field keys to what to show: text, or a data URI for images.
    `pixelate` draws images as pixel art: hard edges when enlarged, not dithered.
    `positions` gives fields their box ({"x", "y", "w", "h", ...} in pixels);
    fields without one get their default. `font_css` holds the @font-face
    rules for the typefaces they use. `images` are the category's style
    images ({"key", "value": data URI, "crisp"}), drawn the same for every item.
    """
    if template not in TEMPLATES:
        raise ValueError(f"unknown template: {template}")
    boxes = {**default_positions(fields, size), **(positions or {})}
    width, height = size
    return _env.get_template(f"{template}.html").render(
        images=[{**i, "type": "image", "box": boxes.get(i["key"]) or default_image_box(size)} for i in images or []],
        fields=[{**f, "value": values.get(f["key"]) or "", "box": boxes[f["key"]]} for f in fields],
        pixelate=pixelate,
        font_css=font_css,
        width=width,
        height=height,
    )

"""Built-in content: the welcome screen and placeholder values for previews."""

from __future__ import annotations

import io

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from . import layouts


def _png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def sunset_photo() -> bytes:
    """A generated photo-like scene with smooth gradients, to show dithering."""
    w, h = 800, 480
    y = np.linspace(0, 1, h)[:, None]
    sky = np.stack(
        [
            np.broadcast_to(70 + 185 * y, (h, w)),
            np.broadcast_to(90 + 90 * y, (h, w)),
            np.broadcast_to(170 - 120 * y, (h, w)),
        ],
        axis=2,
    )
    img = Image.fromarray(sky.clip(0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)
    draw.ellipse((470, 210, 630, 370), fill=(255, 214, 120))
    draw.polygon([(0, 330), (180, 250), (360, 320), (560, 260), (800, 340), (800, 480), (0, 480)], fill=(60, 96, 70))
    draw.polygon([(0, 400), (260, 350), (520, 410), (800, 370), (800, 480), (0, 480)], fill=(32, 58, 44))
    img = img.filter(ImageFilter.GaussianBlur(2))
    return _png(img)


def welcome() -> tuple[str, list[dict], dict]:
    """(template, fields, values) for the screen shown before anything else."""
    fields = layouts.TEMPLATE_INFO["stack"]["fields"]
    return "stack", fields, {
        "image": layouts.data_uri(sunset_photo()),
        "title": "Peek",
        "subtext": "Add a category to fill this frame.",
    }


def placeholder(fields: list[dict]) -> dict:
    """Values to preview a layout with before a category has any items."""
    values = {}
    for f in fields:
        if f["type"] == "image":
            values[f["key"]] = layouts.data_uri(sunset_photo())
        else:
            values[f["key"]] = f["label"]
    return values

"""Built-in sample screens for the preview page."""

from __future__ import annotations

import io

import httpx
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from . import layouts

POKEAPI_SPRITE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{n}.png"


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


def fallback_sprite() -> bytes:
    """A small piece of pixel art, used when PokéAPI can't be reached."""
    rows = [
        "....rrrr....",
        "..rrrrrrrr..",
        ".rrwwrrwwrr.",
        ".rwwbrrwwbr.",
        "rrwwbrrwwbrr",
        "rrrrrrrrrrrr",
        "rrrrrrrrrrrr",
        "rr.rrr.rrr.r",
        "r...r...r...",
    ]
    colors = {"r": (210, 40, 40, 255), "w": (255, 255, 255, 255), "b": (20, 20, 120, 255)}
    img = Image.new("RGBA", (12, 12), (0, 0, 0, 0))
    for yy, row in enumerate(rows):
        for xx, ch in enumerate(row):
            if ch in colors:
                img.putpixel((xx, yy + 2), colors[ch])
    return _png(img.resize((96, 96), Image.NEAREST))


def pokemon_sprite(number: int = 25) -> bytes:
    try:
        r = httpx.get(POKEAPI_SPRITE.format(n=number), timeout=10, follow_redirects=True)
        r.raise_for_status()
        return r.content
    except httpx.HTTPError:
        return fallback_sprite()


def sample(name: str) -> tuple[str, dict]:
    """Return (template, fields) for a named sample."""
    if name == "photo":
        return "photo", {"image": layouts.data_uri(sunset_photo()), "title": "Evening over the hills"}
    if name == "quote":
        return "quote", {"text": "Here's looking at you, kid.", "title": "Casablanca (1942)"}
    if name == "sprite":
        return "sprite", {
            "image": layouts.data_uri(pokemon_sprite(25)),
            "number": "025",
            "title": "pikachu",
            "text": "Electric type. Stores electricity in its cheeks.",
        }
    raise KeyError(name)


SAMPLES = ("photo", "quote", "sprite")

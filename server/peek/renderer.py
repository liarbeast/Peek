"""Turns an HTML layout into a 6-colour image for the panel.

The page is screenshotted in headless Chromium at 800x480, or 480x800 when
the frame hangs in portrait; the result is then turned to the panel's own
800x480 for the frame. Photos are then
dithered while text, shapes and pixel art are mapped to the nearest panel
colour, so letters stay crisp and sprites stay blocky.

To know which pixels belong to a photo, the page is screenshotted two more
times with every photo painted pure white and then pure black. Pixels that
change between those two shots are photo pixels that nothing covers. In
black and white, pixel art is found the same way, so its shades can become
an even dither pattern instead of collapsing to black or white.
"""

from __future__ import annotations

import io
import os
from dataclasses import dataclass, field

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

from . import palette

# <img> elements are photos unless marked otherwise or drawn with
# `image-rendering: pixelated`; anything else (a CSS background, say) can opt
# in with data-peek="photo".
PHOTO_SELECTOR = 'img:not([data-peek]), [data-peek="photo"]'
PIXEL_SELECTOR = '[data-peek="pixel"]'

_MASK_STYLE = "%s { filter: brightness(0) %s !important; }"

_MARK_PIXEL_ART = """
for (const img of document.querySelectorAll("img:not([data-peek])")) {
  if (getComputedStyle(img).imageRendering === "pixelated") img.dataset.peek = "pixel";
}
"""

# Where each field ended up on the page, so the app can draw a box around it
# to drag: {key: [x, y, width, height]}.
_FIELD_BOXES = """
() => Object.fromEntries([...document.querySelectorAll("[data-field]")].map((el) => {
  const r = el.getBoundingClientRect();
  return [el.dataset.field, [r.x, r.y, r.width, r.height].map(Math.round)];
}))
"""

# A pixel counts as photo when painting the photos white versus black moves
# it by more than this much (0-255, summed over RGB / 3).
_MASK_THRESHOLD = 96

# How the frame hangs, and how many quarter turns anticlockwise take the
# upright picture to the panel's own landscape orientation.
ORIENTATIONS = {
    "landscape": 0,
    "portrait": 1,
}


def canvas_size(orientation: str) -> tuple[int, int]:
    """The (width, height) a layout is drawn at for this orientation."""
    if ORIENTATIONS[orientation] % 2:
        return palette.HEIGHT, palette.WIDTH
    return palette.WIDTH, palette.HEIGHT


@dataclass
class Render:
    raw: Image.Image  # what Chromium drew, full colour, upright
    indices: np.ndarray  # palette index (0-5) per pixel, upright
    orientation: str = "landscape"
    boxes: dict[str, list[int]] = field(default_factory=dict)  # where each field was drawn

    def panel_png(self) -> bytes:
        """The PNG the frame downloads: 800x480, paletted, in PANEL colours."""
        turned = np.rot90(self.indices, ORIENTATIONS[self.orientation])
        return png(palette.indices_to_image(np.ascontiguousarray(turned)))

    def preview_png(self) -> bytes:
        """The image upright in MEASURED colours, to show how the panel looks."""
        return png(palette.indices_to_image(self.indices, realistic=True))

    def raw_png(self) -> bytes:
        return png(self.raw)


def png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _shot(page) -> Image.Image:
    return Image.open(io.BytesIO(page.screenshot(type="png"))).convert("RGB")


def _mask(page, selector: str) -> np.ndarray:
    """Which pixels belong to the visible elements matching `selector`."""
    style = page.add_style_tag(content=_MASK_STYLE % (selector, "invert(1)"))
    white = np.asarray(_shot(page), dtype=np.int16)
    style.evaluate("el => el.remove()")
    style = page.add_style_tag(content=_MASK_STYLE % (selector, ""))
    black = np.asarray(_shot(page), dtype=np.int16)
    style.evaluate("el => el.remove()")
    return np.abs(white - black).mean(axis=2) > _MASK_THRESHOLD


def screenshot(html: str, size: tuple[int, int] = (palette.WIDTH, palette.HEIGHT),
               find_pixel_art: bool = False) -> tuple[Image.Image, np.ndarray, np.ndarray, dict]:
    """Return the page as drawn, boolean masks of visible photo pixels and, if
    asked for, pixel-art pixels, and where each field was drawn."""
    width, height = size
    launch = {"args": ["--disable-dev-shm-usage"]}
    if path := os.environ.get("PEEK_CHROMIUM_PATH"):
        launch["executable_path"] = path
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch)
        try:
            page = browser.new_page(
                viewport={"width": width, "height": height},
                device_scale_factor=1,
            )
            page.set_content(html, wait_until="load")
            page.evaluate("document.fonts.ready")
            raw = _shot(page)
            boxes = page.evaluate(_FIELD_BOXES)

            # Images that CSS draws pixelated are pixel art, not photos.
            page.evaluate(_MARK_PIXEL_ART)
            masks = []
            for selector, wanted in ((PHOTO_SELECTOR, True), (PIXEL_SELECTOR, find_pixel_art)):
                present = wanted and page.evaluate(f"document.querySelectorAll({selector!r}).length > 0")
                masks.append(_mask(page, selector) if present else np.zeros((height, width), dtype=bool))
        finally:
            browser.close()
    return raw, *masks, boxes


def reduce(raw: Image.Image, photo_mask: np.ndarray, mono: bool = False,
           pixel_mask: np.ndarray | None = None) -> np.ndarray:
    """Map a full-colour image to palette indices: dither photos only, and in
    black and white give pixel art an even dither pattern."""
    idx = palette.to_indices(raw, dither=False, mono=mono)
    if photo_mask.any():
        dithered = palette.to_indices(raw, dither=True, mono=mono)
        idx = np.where(photo_mask, dithered, idx)
    if mono and pixel_mask is not None and pixel_mask.any():
        idx = np.where(pixel_mask & ~photo_mask, palette.ordered_mono(raw), idx)
    return idx


def render(html: str, orientation: str = "landscape", mono: bool = False) -> Render:
    """Render a page; ``mono`` draws it in black and white only."""
    raw, photos, pixel_art, boxes = screenshot(html, canvas_size(orientation), find_pixel_art=mono)
    return Render(raw=raw, indices=reduce(raw, photos, mono, pixel_art), orientation=orientation, boxes=boxes)

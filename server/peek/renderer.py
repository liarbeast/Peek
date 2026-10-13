"""Turns an HTML layout into a 6-colour image for the panel.

The page is screenshotted in headless Chromium at 800x480. Photos are then
dithered while text, shapes and pixel art are mapped to the nearest panel
colour, so letters stay crisp and sprites stay blocky.

To know which pixels belong to a photo, the page is screenshotted two more
times with every photo painted pure white and then pure black. Pixels that
change between those two shots are photo pixels that nothing covers.
"""

from __future__ import annotations

import io
import os
from dataclasses import dataclass

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

from . import palette

# <img> elements are photos unless marked otherwise; anything else (a CSS
# background, say) can opt in with data-peek="photo".
PHOTO_SELECTOR = 'img:not([data-peek]), [data-peek="photo"]'

_MASK_STYLE = "%s { filter: brightness(0) %s !important; }"

# A pixel counts as photo when painting the photos white versus black moves
# it by more than this much (0-255, summed over RGB / 3).
_MASK_THRESHOLD = 96


@dataclass
class Render:
    raw: Image.Image  # what Chromium drew, full colour
    indices: np.ndarray  # palette index (0-5) per pixel

    def panel_png(self) -> bytes:
        """The PNG the frame downloads: a paletted image in PANEL colours."""
        return png(palette.indices_to_image(self.indices))

    def preview_png(self) -> bytes:
        """The same image in MEASURED colours, to show how the panel looks."""
        return png(palette.indices_to_image(self.indices, realistic=True))

    def raw_png(self) -> bytes:
        return png(self.raw)


def png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _shot(page) -> Image.Image:
    return Image.open(io.BytesIO(page.screenshot(type="png"))).convert("RGB")


def screenshot(html: str) -> tuple[Image.Image, np.ndarray]:
    """Return the page as drawn plus a boolean mask of visible photo pixels."""
    launch = {"args": ["--disable-dev-shm-usage"]}
    if path := os.environ.get("PEEK_CHROMIUM_PATH"):
        launch["executable_path"] = path
    with sync_playwright() as p:
        browser = p.chromium.launch(**launch)
        try:
            page = browser.new_page(
                viewport={"width": palette.WIDTH, "height": palette.HEIGHT},
                device_scale_factor=1,
            )
            page.set_content(html, wait_until="load")
            page.evaluate("document.fonts.ready")
            raw = _shot(page)

            has_photos = page.evaluate(
                f"document.querySelectorAll({PHOTO_SELECTOR!r}).length > 0"
            )
            if not has_photos:
                return raw, np.zeros((palette.HEIGHT, palette.WIDTH), dtype=bool)

            style = page.add_style_tag(content=_MASK_STYLE % (PHOTO_SELECTOR, "invert(1)"))
            white = np.asarray(_shot(page), dtype=np.int16)
            style.evaluate("el => el.remove()")
            page.add_style_tag(content=_MASK_STYLE % (PHOTO_SELECTOR, ""))
            black = np.asarray(_shot(page), dtype=np.int16)
        finally:
            browser.close()

    mask = np.abs(white - black).mean(axis=2) > _MASK_THRESHOLD
    return raw, mask


def reduce(raw: Image.Image, photo_mask: np.ndarray) -> np.ndarray:
    """Map a full-colour image to palette indices: dither photos only."""
    idx = palette.to_indices(raw, dither=False)
    if photo_mask.any():
        dithered = palette.to_indices(raw, dither=True)
        idx = np.where(photo_mask, dithered, idx)
    return idx


def render(html: str) -> Render:
    raw, mask = screenshot(html)
    return Render(raw=raw, indices=reduce(raw, mask))

"""The Spectra 6 panel palette and the colour reduction that targets it.

Two sets of colours matter:

* ``PANEL`` are the values written into the PNG the frame downloads. The
  firmware maps each one to a panel colour, so they are the pure primaries.
* ``MEASURED`` approximate what the panel really shows. Dithering against
  these instead of the pure primaries gives far more natural photos, because
  the panel's "red" is a dark brick red and its "white" is a light grey.
  They are first guesses and get tuned against the real panel in milestone 5.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

COLOR_NAMES = ("black", "white", "yellow", "red", "blue", "green")

PANEL = (
    (0, 0, 0),
    (255, 255, 255),
    (255, 255, 0),
    (255, 0, 0),
    (0, 0, 255),
    (0, 255, 0),
)

MEASURED = (
    (28, 28, 34),
    (226, 226, 218),
    (226, 206, 56),
    (166, 32, 36),
    (38, 70, 150),
    (52, 104, 66),
)

WIDTH, HEIGHT = 800, 480


def _palette_image(colors: tuple[tuple[int, int, int], ...]) -> Image.Image:
    # Pillow needs a full 256-entry palette; pad with the first colour and
    # fold any padding index back onto index 0 afterwards.
    flat = [c for rgb in colors for c in rgb]
    flat += list(colors[0]) * (256 - len(colors))
    pal = Image.new("P", (1, 1))
    pal.putpalette(flat)
    return pal


_MEASURED_PAL = _palette_image(MEASURED)


def to_indices(img: Image.Image, dither: bool) -> np.ndarray:
    """Map an RGB image to palette indices (0-5), matched against MEASURED."""
    mode = Image.Dither.FLOYDSTEINBERG if dither else Image.Dither.NONE
    q = img.convert("RGB").quantize(palette=_MEASURED_PAL, dither=mode)
    idx = np.asarray(q, dtype=np.uint8)
    return np.where(idx >= len(MEASURED), 0, idx).astype(np.uint8)


def indices_to_image(idx: np.ndarray, realistic: bool = False) -> Image.Image:
    """Build a paletted image from indices.

    ``realistic`` uses the MEASURED colours, which is how the preview
    simulates the panel; otherwise the PANEL colours the firmware expects.
    """
    img = Image.fromarray(idx, mode="P")
    colors = MEASURED if realistic else PANEL
    img.putpalette([c for rgb in colors for c in rgb])
    return img

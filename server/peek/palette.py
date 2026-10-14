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
# Black and white only (indices 0 and 1), for categories drawn in greyscale.
_MONO_PAL = _palette_image(MEASURED[:2])


def to_indices(img: Image.Image, dither: bool, mono: bool = False) -> np.ndarray:
    """Map an RGB image to palette indices (0-5), matched against MEASURED.

    With ``mono`` only black and white are used: the image is turned to grey
    first, so colours map by brightness and photos dither to shades of grey.
    """
    if not dither and not mono:
        return nearest_by_hue(img)
    mode = Image.Dither.FLOYDSTEINBERG if dither else Image.Dither.NONE
    if mono:
        q = img.convert("L").convert("RGB").quantize(palette=_MONO_PAL, dither=mode)
    else:
        q = img.convert("RGB").quantize(palette=_MEASURED_PAL, dither=mode)
    idx = np.asarray(q, dtype=np.uint8)
    used = 2 if mono else len(MEASURED)
    return np.where(idx >= used, 0, idx).astype(np.uint8)


def _lab(rgb: np.ndarray) -> np.ndarray:
    """sRGB (0-255, last axis) to CIELAB, D65."""
    c = rgb.astype(np.float32) / 255
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    xyz = c @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]],
                       dtype=np.float32).T
    xyz /= np.array([0.95047, 1, 1.08883], dtype=np.float32)
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


_MEASURED_LAB = _lab(np.array(MEASURED))
# How much a lightness difference counts against a colour of the right hue,
# and how much of a panel colour's chroma a pixel needs before it counts as
# that colour rather than as grey.
_HUE_LIGHTNESS_WEIGHT = 0.3
_HUE_MIN_CHROMA = 0.7


def nearest_by_hue(img: Image.Image) -> np.ndarray:
    """Map each pixel, undithered, to the panel colour a person would name it.

    Plain nearest-colour matching goes wrong on this panel because its colours
    are dark: its green is a deep forest green, so a bright sprite green (and
    even pure green) sits closer to the light yellow. So the four coloured
    inks are matched mostly by hue, with lightness counting only a little,
    while black and white are matched by plain Lab distance. A pixel needs
    enough colour to count as one of the inks, so greys stay black or white.
    """
    rgb = np.asarray(img.convert("RGB"))
    colours, inverse = np.unique(rgb.reshape(-1, 3), axis=0, return_inverse=True)
    lab = _lab(colours)[:, None, :]
    panel = _MEASURED_LAB[None, :, :]
    chroma = np.hypot(lab[..., 1], lab[..., 2])
    panel_chroma = np.hypot(panel[..., 1], panel[..., 2])
    turn = np.arctan2(lab[..., 2], lab[..., 1]) - np.arctan2(panel[..., 2], panel[..., 1])
    hue = 2 * np.sqrt(chroma * panel_chroma) * np.sin(turn / 2)
    too_grey = np.maximum(0, panel_chroma * _HUE_MIN_CHROMA - chroma)
    light = _HUE_LIGHTNESS_WEIGHT * (lab[..., 0] - panel[..., 0])
    inks = np.sqrt(hue**2 + too_grey**2 + light**2)
    plain = np.linalg.norm(lab - panel, axis=-1)
    dist = np.where(np.arange(len(MEASURED)) < 2, plain, inks)
    return np.argmin(dist, axis=1)[inverse.reshape(-1)].reshape(rgb.shape[:2]).astype(np.uint8)


# 4x4 ordered-dither thresholds, from 1/32 to 31/32.
_BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16


def ordered_mono(img: Image.Image) -> np.ndarray:
    """Black and white indices (0 or 1) with a regular dither pattern.

    Used for pixel art in black and white: each shade becomes an even
    pattern, the way old handhelds drew grey, rather than photo-style noise.
    """
    grey = np.asarray(img.convert("L"), dtype=np.float32)
    lo, hi = (sum(MEASURED[i]) / 3 for i in (0, 1))
    level = np.clip((grey - lo) / (hi - lo), 0, 1)
    h, w = level.shape
    threshold = np.tile(_BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w]
    return (level > threshold).astype(np.uint8)


def indices_to_image(idx: np.ndarray, realistic: bool = False) -> Image.Image:
    """Build a paletted image from indices.

    ``realistic`` uses the MEASURED colours, which is how the preview
    simulates the panel; otherwise the PANEL colours the firmware expects.
    """
    img = Image.fromarray(idx, mode="P")
    colors = MEASURED if realistic else PANEL
    img.putpalette([c for rgb in colors for c in rgb])
    return img

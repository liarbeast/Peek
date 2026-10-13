import numpy as np
from PIL import Image

from peek import palette


def gradient() -> Image.Image:
    x = np.linspace(0, 255, palette.WIDTH, dtype=np.uint8)
    rgb = np.stack([np.tile(x, (palette.HEIGHT, 1))] * 3, axis=2)
    return Image.fromarray(rgb, "RGB")


def test_indices_stay_in_palette():
    for dither in (False, True):
        idx = palette.to_indices(gradient(), dither=dither)
        assert idx.shape == (palette.HEIGHT, palette.WIDTH)
        assert idx.max() < len(palette.PANEL)


def test_dithering_mixes_colours_in_greys():
    idx = palette.to_indices(gradient(), dither=True)
    middle = idx[:, 380:420]
    assert len(np.unique(middle)) >= 2


def test_pure_colours_map_to_themselves():
    for i, rgb in enumerate(palette.MEASURED):
        img = Image.new("RGB", (4, 4), rgb)
        assert (palette.to_indices(img, dither=False) == i).all()


def test_panel_image_uses_pure_colours():
    idx = np.arange(6, dtype=np.uint8).reshape(1, 6)
    rgb = np.asarray(palette.indices_to_image(idx).convert("RGB"))[0]
    assert tuple(map(tuple, rgb.tolist())) == palette.PANEL

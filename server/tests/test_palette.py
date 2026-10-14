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


def test_flat_colours_keep_their_hue():
    # Sprite colours that plain nearest-colour matching turned yellow,
    # because the panel's green and red are much darker than they are.
    cases = {
        (99, 255, 90): "green",  # Gold/Silver Ivysaur
        (0, 255, 0): "green",
        (255, 82, 132): "red",  # its pink flower
        (165, 214, 132): "green",
        (226, 206, 56): "yellow",
        (70, 70, 70): "black",
        (240, 230, 200): "white",
        (90, 150, 220): "blue",
    }
    img = Image.fromarray(np.array([list(cases)], dtype=np.uint8), "RGB")
    got = [palette.COLOR_NAMES[i] for i in palette.to_indices(img, dither=False)[0]]
    assert got == list(cases.values())

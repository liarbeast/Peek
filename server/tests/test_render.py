import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from peek import layouts, renderer, samples
from peek.app import create_app

FIELDS = layouts.TEMPLATE_INFO["stack"]["fields"]


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    return TestClient(create_app(tmp_path_factory.mktemp("data")))


def panel_colours(png: bytes) -> set:
    img = Image.open(io.BytesIO(png))
    assert img.size == (800, 480)
    return {c for _, c in img.convert("RGB").getcolors(maxcolors=1 << 20)}


def photo_page(css: str = "") -> str:
    # A full-screen photo with a caption bar over its bottom.
    css = (
        ".field-image { position: absolute; inset: 0; width: 100%; height: 100%; max-height: none; object-fit: cover; }"
        ".field-title { position: absolute; left: 0; right: 0; bottom: 0; height: 60px; background: var(--black); }"
        + css
    )
    values = {"image": layouts.data_uri(samples.sunset_photo()), "title": "Evening"}
    return layouts.build("stack", FIELDS, values, css)


def test_photo_is_dithered_but_caption_is_solid():
    _, mask = renderer.screenshot(photo_page())
    # The caption bar along the bottom covers the photo, so it isn't photo.
    assert mask[200].all()
    assert not mask[470].any()


def test_text_has_no_photo_pixels():
    _, mask = renderer.screenshot(layouts.build("stack", FIELDS, {"title": "Here's looking at you, kid."}))
    assert not mask.any()


def test_pixelated_images_are_pixel_art():
    # Pixel art is told apart from photos by its CSS, and is not dithered.
    _, mask = renderer.screenshot(photo_page(".field-image { image-rendering: pixelated; }"))
    assert not mask.any()


def test_frame_png_and_sleep(client):
    res = client.get("/frame.png")
    assert res.status_code == 200
    assert panel_colours(res.content) <= set(renderer.palette.PANEL)
    assert client.get("/api/sleep").text == "3600"


def test_mono_uses_only_black_and_white():
    raw, mask = renderer.screenshot(photo_page())
    idx = renderer.reduce(raw, mask, mono=True)
    assert set(np.unique(idx)) <= {0, 1}
    # Photos still dither, so greys come out as a mix of both.
    assert len(set(np.unique(idx[:200]))) == 2

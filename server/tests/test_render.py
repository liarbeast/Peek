import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from peek import layouts, renderer, samples
from peek.app import create_app

FIELDS = layouts.TEMPLATE_INFO["canvas"]["fields"]


def with_css(html: str, css: str) -> str:
    """A page with extra CSS, to set up a scene the app itself can't make."""
    return html.replace("</head>", f"<style>{css}</style></head>")


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
        ".field-image { left: 0 !important; top: 0 !important; width: 100% !important; height: 100% !important;"
        " object-fit: cover; }"
        ".field-title { left: 0 !important; top: auto !important; width: 100% !important; bottom: 0; height: 60px;"
        " background: var(--black); z-index: 1; }"
        + css
    )
    values = {"image": layouts.data_uri(samples.sunset_photo()), "title": "Evening"}
    return with_css(layouts.build("canvas", FIELDS, values), css)


def test_photo_is_dithered_but_caption_is_solid():
    _, mask, _, _ = renderer.screenshot(photo_page())
    # The caption bar along the bottom covers the photo, so it isn't photo.
    assert mask[200].all()
    assert not mask[470].any()


def test_text_has_no_photo_pixels():
    _, mask, _, _ = renderer.screenshot(layouts.build("canvas", FIELDS, {"title": "Here's looking at you, kid."}))
    assert not mask.any()


def test_pixelated_images_are_pixel_art():
    # Pixel art is told apart from photos by its CSS, and is not dithered.
    _, mask, _, _ = renderer.screenshot(photo_page(".field-image { image-rendering: pixelated; }"))
    assert not mask.any()


def test_pixelate_filter_makes_pixel_art():
    values = {"image": layouts.data_uri(samples.sunset_photo()), "title": "Evening"}
    _, mask, _, _ = renderer.screenshot(layouts.build("canvas", FIELDS, values, pixelate=True))
    assert not mask.any()
    _, mask, _, _ = renderer.screenshot(layouts.build("canvas", FIELDS, values))
    assert mask.any()


def test_frame_png_and_sleep(client):
    res = client.get("/frame.png")
    assert res.status_code == 200
    assert panel_colours(res.content) <= set(renderer.palette.PANEL)
    assert 60 <= int(client.get("/api/sleep").text) <= 3600 + 60  # until the next hour


def test_mono_uses_only_black_and_white():
    raw, mask, _, _ = renderer.screenshot(photo_page())
    idx = renderer.reduce(raw, mask, mono=True)
    assert set(np.unique(idx)) <= {0, 1}
    # Photos still dither, so greys come out as a mix of both.
    assert len(set(np.unique(idx[:200]))) == 2


def test_mono_pixel_art_keeps_its_shades():
    # A tiny mid-green sprite, enlarged: in black and white its shade becomes
    # an even pattern of both, not a solid block of one.
    sprite = io.BytesIO()
    Image.new("RGB", (8, 8), (52, 140, 66)).save(sprite, format="PNG")
    box = {"x": 300, "y": 140, "w": 200, "h": 200}
    html = layouts.build("canvas", FIELDS, {"image": layouts.data_uri(sprite.getvalue())}, pixelate=True,
                         positions={"image": box})
    render = renderer.render(html, mono=True)
    block = render.indices[150:330, 310:490]
    assert set(np.unique(render.indices)) <= {0, 1}
    assert 0.2 < block.mean() < 0.8

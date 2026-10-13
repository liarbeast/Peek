import io

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from peek import app as app_module
from peek import layouts, renderer, samples


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    app_module.DATA = tmp_path_factory.mktemp("data")
    app_module.CURRENT = app_module.DATA / "current.png"
    return TestClient(app_module.app)


def panel_colours(png: bytes) -> set:
    img = Image.open(io.BytesIO(png))
    assert img.size == (800, 480)
    return {c for _, c in img.convert("RGB").getcolors(maxcolors=1 << 20)}


def test_photo_is_dithered_but_caption_is_solid():
    template, fields = samples.sample("photo")
    raw, mask = renderer.screenshot(layouts.build(template, fields))
    # The caption bar along the bottom covers the photo, so it isn't photo.
    assert mask[200].all()
    assert not mask[470].any()


def test_quote_has_no_photo_pixels():
    template, fields = samples.sample("quote")
    _, mask = renderer.screenshot(layouts.build(template, fields))
    assert not mask.any()


def test_pixel_art_is_not_dithered():
    template, fields = samples.sample("sprite")
    _, mask = renderer.screenshot(layouts.build(template, fields))
    assert not mask.any()


@pytest.mark.parametrize("name", samples.SAMPLES)
def test_sample_endpoint_returns_six_colour_png(client, name):
    res = client.get(f"/render/sample/{name}.png", params={"view": "panel"})
    assert res.status_code == 200
    assert panel_colours(res.content) <= set(renderer.palette.PANEL)


def test_frame_png_and_sleep(client):
    res = client.get("/frame.png")
    assert res.status_code == 200
    assert panel_colours(res.content) <= set(renderer.palette.PANEL)
    assert client.get("/api/sleep").text == "3600"


def test_custom_css_and_set_frame(client):
    form = {"template": "quote", "text": "Hello", "title": "Me", "custom_css": "body { background: var(--blue); }"}
    res = client.post("/frame", data=form)
    assert res.status_code == 200
    frame = np.asarray(Image.open(io.BytesIO(client.get("/frame.png").content)).convert("RGB"))
    assert tuple(frame[5, 5]) == (0, 0, 255)


def test_photo_template_needs_an_image(client):
    assert client.post("/render", data={"template": "photo"}).status_code == 400

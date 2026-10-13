"""Peek's web server: the frame's endpoints plus a preview page."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse, Response
from PIL import Image

from . import layouts, palette, renderer, samples

DATA = Path(os.environ.get("PEEK_DATA", "data"))
CURRENT = DATA / "current.png"
STATIC = Path(__file__).parent / "static"

View = Literal["preview", "panel", "raw"]

app = FastAPI(title="Peek")


def _image_response(data: bytes) -> Response:
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "no-store"})


def _view(render: renderer.Render, view: View) -> bytes:
    if view == "panel":
        return render.panel_png()
    if view == "raw":
        return render.raw_png()
    return render.preview_png()


@lru_cache(maxsize=len(samples.SAMPLES))
def _sample_render(name: str) -> renderer.Render:
    template, fields = samples.sample(name)
    return renderer.render(layouts.build(template, fields))


def _upload_render(template: str, title: str, text: str, custom_css: str, image: UploadFile | None) -> renderer.Render:
    if template not in layouts.TEMPLATES:
        raise HTTPException(400, f"unknown template: {template}")
    fields = {"title": title, "text": text}
    if image is not None and image.filename:
        fields["image"] = layouts.data_uri(image.file.read(), image.content_type or "image/png")
    elif template != "quote":
        raise HTTPException(400, "this template needs an image")
    return renderer.render(layouts.build(template, fields, custom_css))


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC / "preview.html")


@app.get("/api/samples")
def list_samples() -> list[str]:
    return list(samples.SAMPLES)


@app.get("/render/sample/{name}.png")
def render_sample(name: str, view: View = "preview") -> Response:
    if name not in samples.SAMPLES:
        raise HTTPException(404, "no such sample")
    return _image_response(_view(_sample_render(name), view))


@app.post("/render")
def render_upload(
    template: str = Form("photo"),
    title: str = Form(""),
    text: str = Form(""),
    custom_css: str = Form(""),
    image: UploadFile | None = File(None),
    view: View = "preview",
) -> Response:
    return _image_response(_view(_upload_render(template, title, text, custom_css, image), view))


@app.post("/frame")
def set_frame(
    template: str = Form("photo"),
    title: str = Form(""),
    text: str = Form(""),
    custom_css: str = Form(""),
    image: UploadFile | None = File(None),
) -> Response:
    """Render and make it the image the frame shows on its next wake."""
    render = _upload_render(template, title, text, custom_css, image)
    DATA.mkdir(parents=True, exist_ok=True)
    CURRENT.write_bytes(render.panel_png())
    return _image_response(render.preview_png())


@app.post("/frame/sample/{name}")
def set_frame_sample(name: str) -> Response:
    if name not in samples.SAMPLES:
        raise HTTPException(404, "no such sample")
    render = _sample_render(name)
    DATA.mkdir(parents=True, exist_ok=True)
    CURRENT.write_bytes(render.panel_png())
    return _image_response(render.preview_png())


@app.get("/frame.png")
def frame_png() -> Response:
    """The image the frame downloads on each wake."""
    if not CURRENT.exists():
        DATA.mkdir(parents=True, exist_ok=True)
        CURRENT.write_bytes(_sample_render("photo").panel_png())
    return _image_response(CURRENT.read_bytes())


@app.get("/frame/preview.png")
def frame_preview() -> Response:
    """The current frame image in the panel's real colours."""
    frame_png()  # make sure there is one
    idx = np.asarray(Image.open(CURRENT), dtype=np.uint8)
    return _image_response(renderer.png(palette.indices_to_image(idx, realistic=True)))


@app.get("/api/sleep", response_class=PlainTextResponse)
def sleep_seconds() -> str:
    """How long the frame should sleep before its next wake, in seconds.

    A fixed value for now; the scheduler (milestone 3) will compute it.
    """
    return os.environ.get("PEEK_SLEEP_SECONDS", "3600")

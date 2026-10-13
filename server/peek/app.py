"""Peek's web server: the frame's endpoints, the content API and the web app."""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image

from . import content, db, layouts, palette, renderer, samples

STATIC = Path(__file__).parent / "static"
# The built web app (see web/); absent when only the API is installed.
WEB_APP = Path(os.environ.get("PEEK_WEB_APP", STATIC / "app"))

View = Literal["preview", "panel", "raw"]


def _image_response(data: bytes) -> Response:
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "no-store"})


def _view(render: renderer.Render, view: View) -> bytes:
    if view == "panel":
        return render.panel_png()
    if view == "raw":
        return render.raw_png()
    return render.preview_png()


@lru_cache(maxsize=len(samples.SAMPLES) * len(renderer.ORIENTATIONS))
def _sample_render(name: str, orientation: str) -> renderer.Render:
    template, fields, values = samples.sample(name)
    size = renderer.canvas_size(orientation)
    return renderer.render(layouts.build(template, fields, values, size=size), orientation)


def _upload_render(store: db.Store, template: str, title: str, text: str, custom_css: str,
                   image: UploadFile | None) -> renderer.Render:
    if template not in layouts.TEMPLATES:
        raise HTTPException(400, f"unknown template: {template}")
    fields = layouts.TEMPLATE_INFO[template]["fields"]
    values = {"title": title, "text": text}
    if image is not None and image.filename:
        values["image"] = layouts.data_uri(image.file.read(), image.content_type or "image/png")
    elif any(f["type"] == "image" for f in fields):
        raise HTTPException(400, "this template needs an image")
    return content.render_page(store, template, fields, values, custom_css=custom_css)


def create_app(data_dir: Path) -> FastAPI:
    app = FastAPI(title="Peek")
    store = db.Store(data_dir)
    store.migrate()
    # What the frame shows: the panel image, the same upright in real colours,
    # and where it came from so it can be redrawn when the orientation changes.
    current = data_dir / "current.png"
    current_preview = data_dir / "current-preview.png"
    current_source = data_dir / "current.json"

    def sample_render(name: str) -> renderer.Render:
        return _sample_render(name, content.orientation(store))

    def set_current(render: renderer.Render, source: dict | None = None) -> None:
        current.write_bytes(render.panel_png())
        current_preview.write_bytes(render.preview_png())
        current_source.write_text(json.dumps(source or {}))

    def refresh_current() -> None:
        """Redraw what the frame shows, e.g. in a new orientation."""
        try:
            source = json.loads(current_source.read_text())
        except (OSError, ValueError):
            source = {}
        if "item_id" in source and (item := store.item(source["item_id"])):
            category = store.category(item["category_id"])
            set_current(content.render_item(store, category, item), source)
        elif source.get("sample") in samples.SAMPLES:
            set_current(sample_render(source["sample"]), source)

    app.state.store = store
    app.state.set_current = set_current
    app.state.refresh_current = refresh_current
    app.include_router(content.router)

    # The frame's endpoints

    @app.get("/frame.png")
    def frame_png() -> Response:
        """The image the frame downloads on each wake."""
        if not current.exists():
            set_current(sample_render("photo"), {"sample": "photo"})
        return _image_response(current.read_bytes())

    @app.get("/frame/preview.png")
    def frame_preview() -> Response:
        """The current frame image, upright, in the panel's real colours."""
        frame_png()  # make sure there is one
        if current_preview.exists():
            return _image_response(current_preview.read_bytes())
        idx = np.asarray(Image.open(current), dtype=np.uint8)
        return _image_response(renderer.png(palette.indices_to_image(idx, realistic=True)))

    @app.get("/api/sleep", response_class=PlainTextResponse)
    def sleep_seconds() -> str:
        """How long the frame should sleep before its next wake, in seconds.

        A fixed value for now; the scheduler (milestone 3) will compute it.
        """
        return os.environ.get("PEEK_SLEEP_SECONDS", "3600")

    # The renderer test page and its endpoints

    @app.get("/samples", include_in_schema=False)
    def samples_page() -> FileResponse:
        return FileResponse(STATIC / "preview.html")

    @app.get("/api/samples")
    def list_samples() -> list[str]:
        return list(samples.SAMPLES)

    @app.get("/render/sample/{name}.png")
    def render_sample(name: str, view: View = "preview") -> Response:
        if name not in samples.SAMPLES:
            raise HTTPException(404, "no such sample")
        return _image_response(_view(sample_render(name), view))

    @app.post("/render")
    def render_upload(
        template: str = Form("photo"),
        title: str = Form(""),
        text: str = Form(""),
        custom_css: str = Form(""),
        image: UploadFile | None = File(None),
        view: View = "preview",
    ) -> Response:
        return _image_response(_view(_upload_render(store, template, title, text, custom_css, image), view))

    @app.post("/frame")
    def set_frame(
        template: str = Form("photo"),
        title: str = Form(""),
        text: str = Form(""),
        custom_css: str = Form(""),
        image: UploadFile | None = File(None),
    ) -> Response:
        """Render and make it the image the frame shows on its next wake."""
        render = _upload_render(store, template, title, text, custom_css, image)
        set_current(render)
        return _image_response(render.preview_png())

    @app.post("/frame/sample/{name}")
    def set_frame_sample(name: str) -> Response:
        if name not in samples.SAMPLES:
            raise HTTPException(404, "no such sample")
        render = sample_render(name)
        set_current(render, {"sample": name})
        return _image_response(render.preview_png())

    # The web app: static files, with index.html for every other page.

    if WEB_APP.is_dir():
        app.mount("/assets", StaticFiles(directory=WEB_APP / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def web_app(request: Request, path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(404, "no such endpoint")
        index = WEB_APP / "index.html"
        if not index.is_file():
            return FileResponse(STATIC / "preview.html")
        file = (WEB_APP / path).resolve()
        if path and file.is_file() and WEB_APP.resolve() in file.parents:
            return FileResponse(file)
        return FileResponse(index)

    return app


def main() -> FastAPI:
    """The app as uvicorn runs it: `uvicorn --factory peek.app:main`."""
    return create_app(Path(os.environ.get("PEEK_DATA", "data")))

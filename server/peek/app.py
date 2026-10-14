"""Peek's web server: the frame's endpoints, the content API and the web app."""

from __future__ import annotations

import json
import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image

from . import content, db, layouts, palette, renderer, samples, schedule

STATIC = Path(__file__).parent / "static"
# The built web app (see web/); absent when only the API is installed.
WEB_APP = Path(os.environ.get("PEEK_WEB_APP", STATIC / "app"))

_NO_WEB_APP = """<!doctype html><meta charset="utf-8"><title>Peek</title>
<p>Peek's server is running, but its web app isn't built. Run <code>npm run build</code> in <code>web/</code>,
or use the Docker image.</p>"""


def _image_response(data: bytes) -> Response:
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "no-store"})


@lru_cache(maxsize=len(renderer.ORIENTATIONS))
def _welcome_render(orientation: str) -> renderer.Render:
    template, fields, values = samples.welcome()
    size = renderer.canvas_size(orientation)
    return renderer.render(layouts.build(template, fields, values, size=size), orientation)


def create_app(data_dir: Path) -> FastAPI:
    app = FastAPI(title="Peek")
    store = db.Store(data_dir)
    store.migrate()

    # What the frame shows: the panel image, the same upright in real colours,
    # and where it came from so it can be redrawn when the orientation changes.
    current = data_dir / "current.png"
    current_preview = data_dir / "current-preview.png"
    current_source = data_dir / "current.json"

    def periods() -> dict:
        """The refresh and category periods the frame is in now (or is about
        to be in, if it woke a little early); a new one means a new image."""
        now = datetime.now() + schedule.EARLY_WAKE
        settings = store.settings()
        return {"refresh_period": schedule.period_start(settings["refresh"], now).isoformat(),
                "switch_period": "finished" if settings["switch"] == "finished"
                else schedule.period_start(settings["switch"], now).isoformat()}

    def set_current(render: renderer.Render, source: dict | None = None) -> None:
        """Make this what the frame shows until the next refresh."""
        current.write_bytes(render.panel_png())
        current_preview.write_bytes(render.preview_png())
        current_source.write_text(json.dumps({**periods(), **(source or {})}))

    def read_source() -> dict:
        try:
            return json.loads(current_source.read_text())
        except (OSError, ValueError):
            return {}

    def advance() -> None:
        """Move on to the next item once a refresh period has passed."""
        source, now = read_source(), periods()
        if current.exists() and source.get("refresh_period") == now["refresh_period"]:
            return
        content.sync_due(store, (datetime.now() + schedule.EARLY_WAKE).date())
        # The category shown last; its item may be gone if a data source replaced it.
        shown_category = source.get("category_id")
        if shown_category is None and "item_id" in source:
            shown_category = (store.item(source["item_id"]) or {}).get("category_id")
        switch = source.get("switch_period") != now["switch_period"]
        lap = source.get("lap", 1) if now["switch_period"] == "finished" else None
        item = schedule.next_item(store, shown_category, switch, lap)
        if item:
            store.mark_shown(item["id"])
            # How many items of this category the frame has shown in a row (a
            # shown item without a count is the first).
            lap = source.get("lap", 1) + 1 if shown_category == item["category_id"] else 1
            set_current(content.render_item(store, store.category(item["category_id"]), item),
                        {"item_id": item["id"], "category_id": item["category_id"], "lap": lap})
        elif not current.exists():
            set_current(_welcome_render(content.orientation(store)), {"welcome": True})

    def refresh_current() -> None:
        """Redraw what the frame shows, e.g. in a new orientation."""
        source = read_source()
        if "item_id" in source and (item := store.item(source["item_id"])):
            category = store.category(item["category_id"])
            set_current(content.render_item(store, category, item), source)
        else:
            set_current(_welcome_render(content.orientation(store)), {"welcome": True})

    app.state.store = store
    app.state.set_current = set_current
    app.state.refresh_current = refresh_current
    app.include_router(content.router)

    # The frame's endpoints

    @app.get("/frame.png")
    def frame_png() -> Response:
        """The image the frame downloads on each wake."""
        advance()
        return _image_response(current.read_bytes())

    @app.get("/frame/preview.png")
    def frame_preview() -> Response:
        """The current frame image, upright, in the panel's real colours."""
        frame_png()  # make sure it's up to date
        if current_preview.exists():
            return _image_response(current_preview.read_bytes())
        idx = np.asarray(Image.open(current), dtype=np.uint8)
        return _image_response(renderer.png(palette.indices_to_image(idx, realistic=True)))

    @app.get("/api/sleep", response_class=PlainTextResponse)
    def sleep_seconds() -> str:
        """How long the frame should sleep before its next wake, in seconds:
        until the next refresh set in Settings. PEEK_SLEEP_SECONDS overrides
        it, for testing a frame."""
        if fixed := os.environ.get("PEEK_SLEEP_SECONDS"):
            return fixed
        return str(schedule.sleep_seconds(store.settings()["refresh"]))

    # The web app: static files, with index.html for every other page.

    if WEB_APP.is_dir():
        app.mount("/assets", StaticFiles(directory=WEB_APP / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def web_app(request: Request, path: str) -> Response:
        if path.startswith("api/"):
            raise HTTPException(404, "no such endpoint")
        index = WEB_APP / "index.html"
        if not index.is_file():
            return HTMLResponse(_NO_WEB_APP)
        file = (WEB_APP / path).resolve()
        if path and file.is_file() and WEB_APP.resolve() in file.parents:
            return FileResponse(file)
        # The page itself is never cached, so a rebuilt app shows up at once.
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return app


def main() -> FastAPI:
    """The app as uvicorn runs it: `uvicorn --factory peek.app:main`."""
    return create_app(Path(os.environ.get("PEEK_DATA", "data")))

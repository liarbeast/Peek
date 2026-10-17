"""Peek's web server: the frame's endpoints, the content API and the web app."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from datetime import datetime
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image

from . import announce, content, db, layouts, palette, renderer, samples, schedule

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


@asynccontextmanager
async def _lifespan(app: FastAPI):
    announcer = announce.Announcer()
    await announcer.start()
    yield
    await announcer.stop()


# A Li-ion cell's voltage at rest against how full it is (roughly; it depends on the cell).
_LI_ION = [(3.3, 0), (3.6, 10), (3.7, 30), (3.8, 55), (3.9, 70), (4.0, 80), (4.1, 90), (4.2, 100)]


def battery_percent(voltage: float) -> int:
    """How full the battery is, from its voltage."""
    if voltage <= _LI_ION[0][0]:
        return 0
    for (v0, p0), (v1, p1) in zip(_LI_ION, _LI_ION[1:]):
        if voltage <= v1:
            return round(p0 + (p1 - p0) * (voltage - v0) / (v1 - v0))
    return 100


def create_app(data_dir: Path) -> FastAPI:
    app = FastAPI(title="Peek", lifespan=_lifespan)
    store = db.Store(data_dir)
    store.migrate()

    # What the frame shows: the panel image, the same upright in real colours,
    # and where it came from so it can be redrawn when the orientation changes.
    current = data_dir / "current.png"
    current_preview = data_dir / "current-preview.png"
    current_source = data_dir / "current.json"
    # The frame's battery as it last reported it.
    battery_file = data_dir / "battery.json"

    def timing(category_id: int | None) -> tuple[str, str]:
        """The refresh while a category is on the frame (the default with
        none, such as the welcome page) and the frame's switch."""
        category = store.category(category_id) if category_id is not None else None
        return (category and category["refresh"]) or schedule.DEFAULT_REFRESH, store.settings()["switch"]

    def periods(category_id: int | None) -> dict:
        """The refresh and switch periods the frame is in now (or is about to
        be in, if it woke a little early) for a category; a new one means a
        new image, or another category."""
        now = datetime.now() + schedule.EARLY_WAKE
        refresh, switch = timing(category_id)
        return {"refresh_period": schedule.period_start(refresh, now).isoformat(),
                "switch_period": "finished" if switch == "finished" else schedule.period_start(switch, now).isoformat()}

    def set_current(render: renderer.Render, source: dict | None = None) -> None:
        """Make this what the frame shows until the next refresh."""
        current.write_bytes(render.panel_png())
        current_preview.write_bytes(render.preview_png())
        current_source.write_text(json.dumps({**periods((source or {}).get("category_id")), **(source or {})}))

    def read_source() -> dict:
        try:
            return json.loads(current_source.read_text())
        except (OSError, ValueError):
            return {}

    def current_category() -> int | None:
        """The category the frame shows now, if it shows an item."""
        source = read_source()
        if "category_id" in source:
            return source["category_id"]
        return (store.item(source["item_id"]) or {}).get("category_id") if "item_id" in source else None

    def next_switch() -> dict:
        """When the frame moves on from the category it shows: {"at": time},
        or with "Once a collection is finished", {"items_left": n}; and to
        what: {"next": name} in order, or {"shuffle": True}."""
        settings = store.settings()
        category = current_category()
        refresh, switch = timing(category)
        if settings["collection_order"] == "shuffle":
            to = {"shuffle": True}
        else:
            to = {"next": (schedule.next_in_order(store, category) or {}).get("name")}
        if switch == "finished":
            count = sum(1 for i in store.items(category) if i["enabled"]) if category else 0
            return {"items_left": max(count - read_source().get("lap", 1), 0), **to}
        at = schedule.next_switch(switch, refresh, datetime.now())
        return {"at": at.astimezone().isoformat(), **to}

    def advance() -> None:
        """Move on to the next item once a refresh period has passed."""
        source = read_source()
        # The category shown last; its item may be gone if a data source replaced it.
        shown_category = current_category()
        if shown_category is not None and not store.category(shown_category):
            shown_category = None
        now = periods(shown_category)
        if current.exists() and source.get("refresh_period") == now["refresh_period"]:
            return
        switch = source.get("switch_period") != now["switch_period"]
        lap = source.get("lap", 1) if now["switch_period"] == "finished" else None
        day = (datetime.now() + schedule.EARLY_WAKE).date()
        shown_this_round = source.get("round", [])
        item = schedule.next_item(store, shown_category, switch, lap,
                                  fetch=lambda category: content.fetch_quietly(store, category, day),
                                  order=store.settings()["collection_order"], shown_this_round=shown_this_round)
        if item:
            store.mark_shown(item["id"])
            category_id = item["category_id"]
            # How many items of this category the frame has shown in a row (a
            # shown item without a count is the first).
            lap = source.get("lap", 1) + 1 if shown_category == category_id else 1
            # The categories that had a turn this round, for shuffling; one
            # coming round again starts a new round.
            if category_id != shown_category:
                shown_this_round = [*shown_this_round, category_id] if category_id not in shown_this_round else [category_id]
            set_current(content.render_item(store, store.category(category_id), item),
                        {"item_id": item["id"], "category_id": category_id, "lap": lap, "round": shown_this_round})
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
    app.state.current_category = current_category
    app.state.next_switch = next_switch
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
    def sleep_seconds(battery: float | None = None) -> str:
        """How long the frame should sleep before its next wake, in seconds:
        until the next refresh of the category it shows. PEEK_SLEEP_SECONDS
        overrides it, for testing a frame. The frame passes its battery
        voltage along, when it could measure it."""
        if battery is not None and 0 < battery < 10:
            battery_file.write_text(json.dumps({"voltage": round(battery, 2), "at": datetime.now().astimezone().isoformat()}))
        if fixed := os.environ.get("PEEK_SLEEP_SECONDS"):
            return fixed
        return str(schedule.sleep_seconds(timing(current_category())[0]))

    @app.get("/api/battery")
    def battery_level() -> dict | None:
        """The frame's battery as it last reported it, or null before it has."""
        if not battery_file.exists():
            return None
        reading = json.loads(battery_file.read_text())
        return {**reading, "percent": battery_percent(reading["voltage"])}

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

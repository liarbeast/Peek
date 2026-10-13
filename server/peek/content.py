"""JSON API for categories, their items and previews of them."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from . import db, layouts, renderer, samples

router = APIRouter()

View = Literal["preview", "panel", "raw"]

IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    template: str
    custom_css: str = ""
    item_order: str = "in_order"
    weight: int = Field(1, ge=1, le=10)
    enabled: bool = True


class CategoryPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    template: str | None = None
    custom_css: str | None = None
    item_order: str | None = None
    weight: int | None = Field(None, ge=1, le=10)
    enabled: bool | None = None


class PreviewIn(BaseModel):
    template: str | None = None
    custom_css: str | None = None
    item_id: int | None = None


class Reorder(BaseModel):
    item_ids: list[int]


class SettingsPatch(BaseModel):
    orientation: str | None = None


def _store(request: Request) -> db.Store:
    return request.app.state.store


def _check(fields: dict) -> None:
    if fields.get("template") not in (None, *layouts.TEMPLATES):
        raise HTTPException(422, f"unknown template: {fields['template']}")
    if fields.get("item_order") not in (None, *db.ITEM_ORDERS):
        raise HTTPException(422, f"unknown item order: {fields['item_order']}")


def _category_or_404(store: db.Store, category_id: int) -> dict:
    category = store.category(category_id)
    if category is None:
        raise HTTPException(404, "no such category")
    return category


def _item_or_404(store: db.Store, item_id: int) -> dict:
    item = store.item(item_id)
    if item is None:
        raise HTTPException(404, "no such item")
    return item


def _save_image(store: db.Store, upload: UploadFile) -> str:
    ext = IMAGE_TYPES.get(upload.content_type or "")
    if ext is None:
        raise HTTPException(415, "images must be PNG, JPEG, GIF or WebP")
    name = f"{uuid.uuid4().hex}{ext}"
    (store.images / name).write_bytes(upload.file.read())
    return name


def _remove_image(store: db.Store, name: str | None) -> None:
    if name:
        (store.images / name).unlink(missing_ok=True)


def _image_uri(store: db.Store, name: str | None) -> str | None:
    if not name:
        return None
    path = store.images / name
    mime = next((m for m, e in IMAGE_TYPES.items() if e == path.suffix), "image/png")
    return layouts.data_uri(path.read_bytes(), mime)


def item_fields(store: db.Store, item: dict) -> dict:
    """The fields a template sees for an item."""
    return {
        "title": item["title"],
        "subtitle": item["subtitle"],
        "text": item["text"],
        "image": _image_uri(store, item["image"]),
    }


def orientation(store: db.Store) -> str:
    """How the frame hangs; anything unknown counts as landscape."""
    value = store.settings()["orientation"]
    return value if value in renderer.ORIENTATIONS else "landscape"


def render_page(store: db.Store, template: str, fields: dict, custom_css: str = "") -> renderer.Render:
    """Render a layout the way the frame hangs (landscape or portrait)."""
    orientation_ = orientation(store)
    size = renderer.canvas_size(orientation_)
    return renderer.render(layouts.build(template, fields, custom_css, size), orientation_)


def render_item(store: db.Store, category: dict, item: dict | None, template: str | None = None,
                custom_css: str | None = None) -> renderer.Render:
    template = template or category["template"]
    css = category["custom_css"] if custom_css is None else custom_css
    fields = item_fields(store, item) if item else samples.placeholder(template)
    return render_page(store, template, fields, css)


def _png(render: renderer.Render, view: View) -> Response:
    data = {"panel": render.panel_png, "raw": render.raw_png}.get(view, render.preview_png)()
    return Response(content=data, media_type="image/png", headers={"Cache-Control": "no-store"})


@router.get("/api/settings")
def get_settings(request: Request) -> dict:
    return _store(request).settings()


@router.patch("/api/settings")
def update_settings(request: Request, body: SettingsPatch) -> dict:
    fields = body.model_dump(exclude_none=True)
    if fields.get("orientation") not in (None, *renderer.ORIENTATIONS):
        raise HTTPException(422, f"unknown orientation: {fields['orientation']}")
    before = _store(request).settings()
    settings = _store(request).update_settings(fields)
    if settings["orientation"] != before["orientation"]:
        # Turn what the frame shows now, so it doesn't wait for the next change.
        request.app.state.refresh_current()
    return settings


@router.get("/api/templates")
def templates() -> list[dict]:
    return [{"name": name, **layouts.TEMPLATE_INFO[name]} for name in layouts.TEMPLATES]


@router.get("/api/categories")
def list_categories(request: Request) -> list[dict]:
    return _store(request).categories()


@router.post("/api/categories", status_code=201)
def create_category(request: Request, body: CategoryIn) -> dict:
    fields = body.model_dump()
    _check(fields)
    return _store(request).create_category(fields)


@router.get("/api/categories/{category_id}")
def get_category(request: Request, category_id: int) -> dict:
    return _category_or_404(_store(request), category_id)


@router.patch("/api/categories/{category_id}")
def update_category(request: Request, category_id: int, body: CategoryPatch) -> dict:
    store = _store(request)
    _category_or_404(store, category_id)
    fields = body.model_dump(exclude_none=True)
    _check(fields)
    return store.update_category(category_id, fields)


@router.delete("/api/categories/{category_id}", status_code=204)
def delete_category(request: Request, category_id: int) -> None:
    store = _store(request)
    _category_or_404(store, category_id)
    for name in store.delete_category(category_id):
        _remove_image(store, name)


@router.post("/api/categories/{category_id}/preview.png")
def preview_category(request: Request, category_id: int, body: PreviewIn, view: View = "preview") -> Response:
    """Render a category's style, optionally with unsaved template or CSS changes."""
    store = _store(request)
    category = _category_or_404(store, category_id)
    _check(body.model_dump(exclude_none=True))
    item = None
    if body.item_id is not None:
        item = _item_or_404(store, body.item_id)
    else:
        items = store.items(category_id)
        item = items[0] if items else None
    return _png(render_item(store, category, item, body.template, body.custom_css), view)


@router.get("/api/categories/{category_id}/items")
def list_items(request: Request, category_id: int) -> list[dict]:
    store = _store(request)
    _category_or_404(store, category_id)
    return store.items(category_id)


@router.post("/api/categories/{category_id}/items", status_code=201)
def create_items(
    request: Request,
    category_id: int,
    title: str = Form(""),
    subtitle: str = Form(""),
    text: str = Form(""),
    images: list[UploadFile] = File(default_factory=list),
) -> list[dict]:
    """Add one item, or one item per image when several images are uploaded.

    With several images, each item's title defaults to its file name.
    """
    store = _store(request)
    _category_or_404(store, category_id)
    images = [i for i in images if i.filename]
    if len(images) <= 1:
        image = _save_image(store, images[0]) if images else None
        if not (image or title or text):
            raise HTTPException(422, "an item needs an image, a title or some text")
        return [store.create_item(category_id, {"title": title, "subtitle": subtitle, "text": text, "image": image})]
    created = []
    for upload in images:
        name = _save_image(store, upload)
        created.append(store.create_item(category_id, {
            "title": title or Path(upload.filename).stem.replace("_", " ").replace("-", " "),
            "subtitle": subtitle,
            "text": text,
            "image": name,
        }))
    return created


@router.put("/api/categories/{category_id}/items/order", status_code=204)
def reorder_items(request: Request, category_id: int, body: Reorder) -> None:
    store = _store(request)
    _category_or_404(store, category_id)
    store.reorder_items(category_id, body.item_ids)


@router.patch("/api/items/{item_id}")
def update_item(
    request: Request,
    item_id: int,
    title: str | None = Form(None),
    subtitle: str | None = Form(None),
    text: str | None = Form(None),
    enabled: bool | None = Form(None),
    remove_image: bool = Form(False),
    image: UploadFile | None = File(None),
) -> dict:
    store = _store(request)
    item = _item_or_404(store, item_id)
    fields = {"title": title, "subtitle": subtitle, "text": text, "enabled": enabled}
    fields = {k: v for k, v in fields.items() if v is not None}
    if image is not None and image.filename:
        fields["image"] = _save_image(store, image)
        _remove_image(store, item["image"])
    elif remove_image:
        fields["image"] = None
        _remove_image(store, item["image"])
    return store.update_item(item_id, fields)


@router.delete("/api/items/{item_id}", status_code=204)
def delete_item(request: Request, item_id: int) -> None:
    store = _store(request)
    _item_or_404(store, item_id)
    _remove_image(store, store.delete_item(item_id))


@router.get("/api/items/{item_id}/preview.png")
def preview_item(request: Request, item_id: int, view: View = "preview") -> Response:
    store = _store(request)
    item = _item_or_404(store, item_id)
    return _png(render_item(store, store.category(item["category_id"]), item), view)


@router.post("/api/items/{item_id}/show")
def show_item(request: Request, item_id: int) -> Response:
    """Make this item the image the frame shows on its next wake."""
    store = _store(request)
    item = _item_or_404(store, item_id)
    render = render_item(store, store.category(item["category_id"]), item)
    request.app.state.set_current(render, {"item_id": item_id})
    return _png(render, "preview")


@router.get("/images/{name}")
def image(request: Request, name: str) -> FileResponse:
    store = _store(request)
    path = (store.images / name).resolve()
    if path.parent != store.images.resolve() or not path.is_file():
        raise HTTPException(404, "no such image")
    return FileResponse(path, headers={"Cache-Control": "max-age=31536000, immutable"})

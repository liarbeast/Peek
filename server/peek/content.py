"""JSON API for categories, their fields and items, CSV import and previews."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field, field_validator
from starlette.datastructures import UploadFile as FormFile

from . import csv_import, db, fonts, layouts, renderer, samples
from . import fields as fieldlib

router = APIRouter()

View = Literal["preview", "panel", "raw"]

IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


class Box(BaseModel):
    """Where a dragged field sits, in pixels of the upright page."""

    x: int = Field(ge=-800, le=800)
    y: int = Field(ge=-800, le=800)
    w: int = Field(ge=8, le=800)
    h: int = Field(ge=8, le=800)
    # Text size in pixels. A text box is as tall as its lines, so `h` only
    # applies to images.
    size: int | None = Field(default=None, ge=6, le=400)
    bold: bool | None = None
    color: Literal["black", "white", "yellow", "red", "blue", "green"] | None = None
    font: str | None = None  # a family from fonts.FONTS; none is the built-in face
    align: Literal["left", "center", "right"] | None = None
    valign: Literal["top", "middle", "bottom"] | None = None
    z: int | None = Field(default=None, ge=-100, le=100)  # higher is drawn in front
    # Linked below another field: drawn `gap` pixels under where that field's
    # content ends, so a title that wraps to two lines pushes it down.
    below: str | None = Field(default=None, max_length=64)
    gap: int | None = Field(default=None, ge=-800, le=800)

    @field_validator("font")
    @classmethod
    def _known_font(cls, value: str | None) -> str | None:
        if value is not None and value not in fonts.FONTS:
            raise ValueError("unknown font")
        return value


# Per orientation, the fields that were dragged to a place.
Positions = dict[Literal["landscape", "portrait"], dict[str, Box]]


class FieldIn(BaseModel):
    key: str | None = None
    label: str
    type: str = "text"


class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    template: str = "canvas"
    # Start from another category's fields and style instead of the defaults.
    copy_from: int | None = None
    item_order: str = "in_order"
    weight: int = Field(1, ge=1, le=10)
    enabled: bool = True


class CategoryPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    template: str | None = None
    item_order: str | None = None
    weight: int | None = Field(None, ge=1, le=10)
    enabled: bool | None = None
    mono: bool | None = None
    pixelate: bool | None = None
    positions: Positions | None = None
    fields: list[FieldIn] | None = None


class PreviewIn(BaseModel):
    """Unsaved style changes to preview."""

    template: str | None = None
    mono: bool | None = None
    pixelate: bool | None = None
    positions: Positions | None = None
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


def _save_image(store: db.Store, upload: FormFile) -> str:
    ext = IMAGE_TYPES.get(upload.content_type or "")
    if ext is None:
        raise HTTPException(415, "images must be PNG, JPEG, GIF or WebP")
    return _save_image_bytes(store, upload.file.read(), ext)


def _save_image_bytes(store: db.Store, data: bytes, ext: str) -> str:
    name = f"{uuid.uuid4().hex}{ext}"
    (store.images / name).write_bytes(data)
    return name


def _remove_image(store: db.Store, name: str | None) -> None:
    if name:
        (store.images / name).unlink(missing_ok=True)


def _image_uri(store: db.Store, name: str | None) -> str | None:
    if not name:
        return None
    path = store.images / name
    if not path.is_file():
        return None
    mime = next((m for m, e in IMAGE_TYPES.items() if e == path.suffix), "image/png")
    return layouts.data_uri(path.read_bytes(), mime)


def _item_images(category: dict, item: dict) -> list[str]:
    """The image files an item holds."""
    return [item["data"][k] for k in fieldlib.image_keys(category["fields"]) if item["data"].get(k)]


def item_values(store: db.Store, category: dict, item: dict) -> dict:
    """What a layout shows for an item: text as is, images as data URIs."""
    values = {}
    for f in category["fields"]:
        value = item["data"].get(f["key"])
        values[f["key"]] = _image_uri(store, value) if f["type"] == "image" else value
    return values


def orientation(store: db.Store) -> str:
    """How the frame hangs; anything unknown counts as landscape."""
    value = store.settings()["orientation"]
    return value if value in renderer.ORIENTATIONS else "landscape"


def render_page(store: db.Store, template: str, fields: list[dict], values: dict,
                mono: bool = False, pixelate: bool = False,
                positions: dict | None = None, images: list[dict] | None = None) -> renderer.Render:
    """Render a layout the way the frame hangs (landscape or portrait), with
    the fields dragged to a place for that orientation."""
    orientation_ = orientation(store)
    size = renderer.canvas_size(orientation_)
    boxes = (positions or {}).get(orientation_) or {}
    cache = fonts.FontCache(store.data_dir / "fonts")
    font_css = "\n".join(cache.css(family) for family in sorted({b.get("font") for b in boxes.values()} - {None}))
    html = layouts.build(template, fields, values, size, pixelate, boxes, font_css, images)
    return renderer.render(html, orientation_, mono)


def render_item(store: db.Store, category: dict, item: dict | None, changes: dict | None = None) -> renderer.Render:
    """Render an item (or placeholder content) in its category's style.

    `changes` overrides saved style settings, to preview unsaved edits.
    """
    style = {**category, **{k: v for k, v in (changes or {}).items() if v is not None}}
    template = style["template"] if style["template"] in layouts.TEMPLATES else layouts.TEMPLATES[0]
    values = item_values(store, category, item) if item else samples.placeholder(category["fields"])
    images = [{"key": i["key"], "value": uri, "crisp": i["crisp"]}
              for i in store.category_images(category["id"]) if (uri := _image_uri(store, i["file"]))]
    return render_page(store, template, category["fields"], values, style["mono"], style["pixelate"],
                       style["positions"], images)


def _png(render: renderer.Render, view: View) -> Response:
    """The render as a PNG, with where each field was drawn in a header so the
    app can let people drag them."""
    data = {"panel": render.panel_png, "raw": render.raw_png}.get(view, render.preview_png)()
    headers = {"Cache-Control": "no-store", "X-Peek-Boxes": json.dumps(render.boxes)}
    return Response(content=data, media_type="image/png", headers=headers)


# Settings


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


# Categories


@router.get("/api/templates")
def templates() -> list[dict]:
    return [{"name": name, **layouts.TEMPLATE_INFO[name]} for name in layouts.TEMPLATES]


@router.get("/api/field-types")
def field_types() -> list[str]:
    return list(fieldlib.FIELD_TYPES)


@router.get("/api/categories")
def list_categories(request: Request) -> list[dict]:
    return _store(request).categories()


@router.post("/api/categories", status_code=201)
def create_category(request: Request, body: CategoryIn) -> dict:
    store = _store(request)
    new = body.model_dump(exclude={"copy_from"})
    if body.copy_from is not None:
        source = _category_or_404(store, body.copy_from)
        for key in ("template", "fields", "mono", "pixelate", "positions", "item_order"):
            new[key] = source[key]
    else:
        _check(new)
        new["fields"] = layouts.TEMPLATE_INFO[body.template]["fields"]
    _check(new)
    created = store.create_category(new)
    if body.copy_from is not None:
        # Style images are copied too, and their boxes follow them to their new keys.
        keys = {}
        for image in store.category_images(body.copy_from):
            path = store.images / image["file"]
            if path.is_file():
                file = _save_image_bytes(store, path.read_bytes(), path.suffix)
                copy = store.create_category_image(created["id"], image["name"], file, image["crisp"])
                keys[image["key"]] = copy["key"]
        if keys:
            positions = {o: {keys.get(k, k): box for k, box in boxes.items()} for o, boxes in new["positions"].items()}
            created = store.update_category(created["id"], {"positions": positions})
    return created


@router.get("/api/categories/{category_id}")
def get_category(request: Request, category_id: int) -> dict:
    return _category_or_404(_store(request), category_id)


@router.patch("/api/categories/{category_id}")
def update_category(request: Request, category_id: int, body: CategoryPatch) -> dict:
    store = _store(request)
    category = _category_or_404(store, category_id)
    changes = body.model_dump(exclude_none=True)
    _check(changes)
    if body.fields is not None:
        try:
            changes["fields"] = fieldlib.normalize([f.model_dump() for f in body.fields])
        except fieldlib.FieldError as e:
            raise HTTPException(422, str(e)) from e
        _drop_changed_values(store, category, changes["fields"])
    return store.update_category(category_id, changes)


def _drop_changed_values(store: db.Store, category: dict, new_fields: list[dict]) -> None:
    """Clear values of removed fields, and of fields that became or stopped
    being images (a file name means nothing as text, and the other way round).
    """
    new_types = {f["key"]: f["type"] for f in new_fields}
    stale = [
        f for f in category["fields"]
        if f["key"] not in new_types or (f["type"] == "image") != (new_types[f["key"]] == "image")
    ]
    if not stale:
        return
    for item in store.items(category["id"]):
        data = dict(item["data"])
        for f in stale:
            value = data.pop(f["key"], None)
            if f["type"] == "image":
                _remove_image(store, value)
        if data != item["data"]:
            store.update_item(item["id"], {"data": data})


@router.delete("/api/categories/{category_id}", status_code=204)
def delete_category(request: Request, category_id: int) -> None:
    store = _store(request)
    category = _category_or_404(store, category_id)
    images = [name for item in store.items(category_id) for name in _item_images(category, item)]
    images += [image["file"] for image in store.category_images(category_id)]
    store.delete_category(category_id)
    for name in images:
        _remove_image(store, name)


@router.post("/api/categories/{category_id}/preview.png")
def preview_category(request: Request, category_id: int, body: PreviewIn, view: View = "preview") -> Response:
    """Render a category's style, optionally with unsaved style changes."""
    store = _store(request)
    category = _category_or_404(store, category_id)
    changes = body.model_dump(exclude_none=True, exclude={"item_id"})
    _check(changes)
    if body.item_id is not None:
        item = _item_or_404(store, body.item_id)
    else:
        items = store.items(category_id)
        item = items[0] if items else None
    return _png(render_item(store, category, item, changes), view)


# Style images: uploaded once per category, drawn the same for every item.

class CategoryImagePatch(BaseModel):
    crisp: bool | None = None


def _category_image_or_404(store: db.Store, image_id: int) -> dict:
    image = store.category_image(image_id)
    if image is None:
        raise HTTPException(404, "no such image")
    return image


@router.get("/api/categories/{category_id}/images")
def list_category_images(request: Request, category_id: int) -> list[dict]:
    store = _store(request)
    _category_or_404(store, category_id)
    return store.category_images(category_id)


@router.post("/api/categories/{category_id}/images", status_code=201)
def add_category_image(request: Request, category_id: int, file: UploadFile = File(...)) -> dict:
    """Upload a style image, named after its file.

    PNG and GIF files usually hold graphics, so they start out crisp; JPEG
    and WebP files are usually photos, so they start out dithered.
    """
    store = _store(request)
    _category_or_404(store, category_id)
    name = Path(file.filename or "image").stem[:60] or "image"
    crisp = file.content_type in ("image/png", "image/gif")
    return store.create_category_image(category_id, name, _save_image(store, file), crisp)


@router.patch("/api/category-images/{image_id}")
def update_category_image(request: Request, image_id: int, body: CategoryImagePatch) -> dict:
    store = _store(request)
    _category_image_or_404(store, image_id)
    return store.update_category_image(image_id, body.model_dump(exclude_none=True))


@router.delete("/api/category-images/{image_id}", status_code=204)
def delete_category_image(request: Request, image_id: int) -> None:
    store = _store(request)
    image = _category_image_or_404(store, image_id)
    store.delete_category_image(image_id)
    _remove_image(store, image["file"])


@router.get("/api/fonts")
def list_fonts() -> list[str]:
    """The Google Fonts text fields can use."""
    return list(fonts.FONTS)


# Items


@router.get("/api/categories/{category_id}/items")
def list_items(request: Request, category_id: int) -> list[dict]:
    store = _store(request)
    _category_or_404(store, category_id)
    return store.items(category_id)


def _text_values(category: dict, raw: str) -> dict:
    """Parse the "data" form field: a JSON object of text values by field key."""
    try:
        values = json.loads(raw or "{}")
    except ValueError as e:
        raise HTTPException(422, "data must be a JSON object") from e
    if not isinstance(values, dict):
        raise HTTPException(422, "data must be a JSON object")
    types = {f["key"]: f["type"] for f in category["fields"]}
    out = {}
    for key, value in values.items():
        if key not in types:
            raise HTTPException(422, f"no such field: {key}")
        if types[key] == "image":
            raise HTTPException(422, f"{key} is an image field; upload a file for it")
        out[key] = str(value).strip() if value is not None else ""
    return out


async def _uploads(store: db.Store, category: dict, form) -> dict:
    """Save files sent as "image:<key>" and return {key: file name}."""
    image_keys = set(fieldlib.image_keys(category["fields"]))
    saved = {}
    for name, value in form.multi_items():
        if not name.startswith("image:") or not isinstance(value, FormFile) or not value.filename:
            continue
        key = name.removeprefix("image:")
        if key not in image_keys:
            raise HTTPException(422, f"{key} is not an image field")
        saved[key] = _save_image(store, value)
    return saved


@router.post("/api/categories/{category_id}/items", status_code=201)
async def create_item(request: Request, category_id: int) -> dict:
    """Add an item. Form fields: "data" (JSON of text values by field key)
    and one "image:<key>" file per image field.
    """
    store = _store(request)
    category = _category_or_404(store, category_id)
    form = await request.form()
    data = {k: v for k, v in _text_values(category, form.get("data", "{}")).items() if v}
    data.update(await _uploads(store, category, form))
    if not data:
        raise HTTPException(422, "fill in at least one field")
    return store.create_item(category_id, data)


@router.post("/api/categories/{category_id}/items/images", status_code=201)
def create_items_from_images(
    request: Request, category_id: int, images: list[UploadFile] = File(default_factory=list)
) -> list[dict]:
    """One item per uploaded image, named after its file.

    The image goes in the category's first image field and the file name in
    its first text field.
    """
    store = _store(request)
    category = _category_or_404(store, category_id)
    image_key = next(iter(fieldlib.image_keys(category["fields"])), None)
    if image_key is None:
        raise HTTPException(422, "this category has no image field")
    text_key = next((f["key"] for f in category["fields"] if f["type"] == "text"), None)
    images = [i for i in images if i.filename]
    if not images:
        raise HTTPException(422, "no images uploaded")
    datas = []
    for upload in images:
        data = {image_key: _save_image(store, upload)}
        if text_key:
            data[text_key] = Path(upload.filename).stem.replace("_", " ").replace("-", " ")
        datas.append(data)
    return store.create_items(category_id, datas)


@router.put("/api/categories/{category_id}/items/order", status_code=204)
def reorder_items(request: Request, category_id: int, body: Reorder) -> None:
    store = _store(request)
    _category_or_404(store, category_id)
    store.reorder_items(category_id, body.item_ids)


@router.patch("/api/items/{item_id}")
async def update_item(request: Request, item_id: int) -> dict:
    """Change an item. Form fields: "data" (JSON of text values to change; an
    empty value clears it), "image:<key>" files to replace, "remove:<key>" to
    clear an image, and "enabled" ("true" or "false").
    """
    store = _store(request)
    item = _item_or_404(store, item_id)
    category = store.category(item["category_id"])
    form = await request.form()
    data = dict(item["data"])
    for key, value in _text_values(category, form.get("data", "{}")).items():
        if value:
            data[key] = value
        else:
            data.pop(key, None)
    for key in fieldlib.image_keys(category["fields"]):
        if form.get(f"remove:{key}") == "true":
            _remove_image(store, data.pop(key, None))
    for key, name in (await _uploads(store, category, form)).items():
        _remove_image(store, data.get(key))
        data[key] = name
    changes: dict = {"data": data}
    if "enabled" in form:
        changes["enabled"] = form["enabled"] == "true"
    return store.update_item(item_id, changes)


@router.delete("/api/items/{item_id}", status_code=204)
def delete_item(request: Request, item_id: int) -> None:
    store = _store(request)
    item = _item_or_404(store, item_id)
    images = _item_images(store.category(item["category_id"]), item)
    store.delete_item(item_id)
    for name in images:
        _remove_image(store, name)


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


# CSV import


def _read_csv(upload: UploadFile) -> tuple[list[str], list[list[str]]]:
    try:
        return csv_import.parse(upload.file.read())
    except csv_import.CsvError as e:
        raise HTTPException(422, str(e)) from e


@router.post("/api/categories/{category_id}/import/preview")
def preview_import(request: Request, category_id: int, file: UploadFile = File(...)) -> dict:
    """The CSV's columns, each matched to a field by name where possible, with
    a guessed type for columns that would become new fields.
    """
    category = _category_or_404(_store(request), category_id)
    header, rows = _read_csv(file)
    columns = []
    for i, name in enumerate(header):
        values = [r[i] for r in rows]
        columns.append({
            "name": name,
            "field": csv_import.match_field(name, category["fields"]),
            "type": csv_import.guess_type(name, values[:200]),
            "samples": [v for v in values if v.strip()][:3],
        })
    return {"columns": columns, "rows": len(rows)}


@router.post("/api/categories/{category_id}/import")
def run_import(
    request: Request, category_id: int, file: UploadFile = File(...), mapping: str = Form(...)
) -> dict:
    """Import a CSV: one item per row.

    `mapping` is a JSON list with one entry per column: {"field": key} to
    fill an existing field, {"new": {"label", "type"}} to add a field, or
    null to skip the column. Image columns hold URLs, which are downloaded.
    """
    store = _store(request)
    category = _category_or_404(store, category_id)
    header, rows = _read_csv(file)
    try:
        plan = json.loads(mapping)
    except ValueError as e:
        raise HTTPException(422, "mapping must be JSON") from e
    if not isinstance(plan, list) or len(plan) != len(header):
        raise HTTPException(422, "mapping needs one entry per column")

    # Add the new fields first, so every mapped column has a key.
    fields = list(category["fields"])
    new_fields = [p["new"] for p in plan if isinstance(p, dict) and "new" in p]
    if new_fields:
        try:
            fields = fieldlib.normalize(fields + [{"label": n.get("label"), "type": n.get("type", "text")} for n in new_fields])
        except fieldlib.FieldError as e:
            raise HTTPException(422, str(e)) from e
    added = iter(fields[len(category["fields"]):])
    types = {f["key"]: f["type"] for f in fields}
    targets: list[str | None] = []
    for entry in plan:
        if entry is None:
            targets.append(None)
        elif "new" in entry:
            targets.append(next(added)["key"])
        elif entry.get("field") in types:
            targets.append(entry["field"])
        else:
            raise HTTPException(422, f"no such field: {entry.get('field')}")

    image_columns = [i for i, key in enumerate(targets) if key and types[key] == "image"]
    urls = [r[i].strip() for r in rows for i in image_columns]
    downloads = csv_import.download_images(urls, IMAGE_TYPES) if urls else {}

    datas, images_failed = [], 0
    for row in rows:
        data = {}
        for i, key in enumerate(targets):
            value = row[i].strip()
            if not key or not value:
                continue
            if types[key] == "image":
                got = downloads.get(value)
                if got is None:
                    images_failed += 1
                    continue
                data[key] = _save_image_bytes(store, *got)
            else:
                data[key] = value
        if data:
            datas.append(data)

    if fields != category["fields"]:
        store.update_category(category_id, {"fields": fields})
    created = store.create_items(category_id, datas) if datas else []
    return {"created": len(created), "images_failed": images_failed, "category": store.category(category_id)}


@router.get("/images/{name}")
def image(request: Request, name: str) -> FileResponse:
    store = _store(request)
    path = (store.images / name).resolve()
    if path.parent != store.images.resolve() or not path.is_file():
        raise HTTPException(404, "no such image")
    return FileResponse(path, headers={"Cache-Control": "max-age=31536000, immutable"})

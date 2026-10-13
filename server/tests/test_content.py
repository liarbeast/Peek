import io
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from peek.app import create_app


def png(color=(200, 40, 40), size=(32, 32)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(tmp_path))


def make_category(client, **fields):
    body = {"name": "Birds", "template": "photo", **fields}
    res = client.post("/api/categories", json=body)
    assert res.status_code == 201, res.text
    return res.json()


def add_item(client, category_id, data=None, images=None):
    files = [(f"image:{key}", (f"{key}.png", content, "image/png")) for key, content in (images or {}).items()]
    res = client.post(
        f"/api/categories/{category_id}/items",
        data={"data": json.dumps(data or {})},
        files=files or None,
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_templates_are_listed(client):
    names = [t["name"] for t in client.get("/api/templates").json()]
    assert names == ["photo", "quote", "sprite", "stack"]


def test_category_crud(client):
    cat = make_category(client, custom_css=".caption { color: red; }")
    assert cat["item_count"] == 0 and cat["enabled"] is True
    assert [f["key"] for f in cat["fields"]] == ["image", "title"]

    res = client.patch(f"/api/categories/{cat['id']}", json={"name": "Garden birds", "item_order": "shuffle"})
    assert res.json()["name"] == "Garden birds"
    assert res.json()["item_order"] == "shuffle"
    assert res.json()["custom_css"] == ".caption { color: red; }"

    assert [c["name"] for c in client.get("/api/categories").json()] == ["Garden birds"]
    assert client.delete(f"/api/categories/{cat['id']}").status_code == 204
    assert client.get(f"/api/categories/{cat['id']}").status_code == 404


def test_unknown_template_and_order_are_rejected(client):
    assert client.post("/api/categories", json={"name": "X", "template": "nope"}).status_code == 422
    cat = make_category(client)
    assert client.patch(f"/api/categories/{cat['id']}", json={"item_order": "sideways"}).status_code == 422


def test_copy_category_takes_fields_and_style(client):
    src = make_category(client, template="quote", custom_css=".text { color: red; }")
    client.patch(f"/api/categories/{src['id']}", json={"fields": src["fields"] + [{"label": "Year", "type": "number"}]})
    res = client.post("/api/categories", json={"name": "More quotes", "copy_from": src["id"]})
    assert res.status_code == 201
    copy = res.json()
    assert copy["template"] == "quote" and copy["custom_css"] == ".text { color: red; }"
    assert [f["key"] for f in copy["fields"]] == ["text", "title", "year"]


def test_field_editing(client):
    cat = make_category(client)
    fields = cat["fields"] + [{"label": "Pokédex no.", "type": "number"}, {"label": "Year", "type": "number"}]
    res = client.patch(f"/api/categories/{cat['id']}", json={"fields": fields})
    assert res.status_code == 200, res.text
    assert [f["key"] for f in res.json()["fields"]] == ["image", "title", "pokedex-no", "year"]

    # Renaming keeps the key, so CSS that targets .field-year keeps working.
    fields = res.json()["fields"]
    fields[3]["label"] = "Released"
    res = client.patch(f"/api/categories/{cat['id']}", json={"fields": fields})
    assert res.json()["fields"][3] == {"key": "year", "label": "Released", "type": "number"}

    bad = [{"label": "", "type": "text"}]
    assert client.patch(f"/api/categories/{cat['id']}", json={"fields": bad}).status_code == 422
    bad = [{"label": "X", "type": "colour"}]
    assert client.patch(f"/api/categories/{cat['id']}", json={"fields": bad}).status_code == 422


def test_removing_an_image_field_removes_its_files(client, tmp_path):
    cat = make_category(client)
    item = add_item(client, cat["id"], {"title": "Robin"}, {"image": png()})
    path = tmp_path / "images" / item["data"]["image"]
    assert path.exists()
    res = client.patch(f"/api/categories/{cat['id']}", json={"fields": [cat["fields"][1]]})
    assert res.status_code == 200
    assert not path.exists()
    assert client.get(f"/api/categories/{cat['id']}/items").json()[0]["data"] == {"title": "Robin"}


def test_items_with_images(client, tmp_path):
    cat = make_category(client)
    item = add_item(client, cat["id"], {"title": "Robin"}, {"image": png()})
    assert item["data"]["title"] == "Robin" and item["data"]["image"].endswith(".png")
    assert client.get(f"/images/{item['data']['image']}").content == png()
    assert client.get("/api/categories").json()[0]["cover"] == item["data"]["image"]

    # Replacing the image removes the old file.
    old = tmp_path / "images" / item["data"]["image"]
    res = client.patch(f"/api/items/{item['id']}", files={"image:image": ("new.png", png((0, 0, 255)), "image/png")})
    assert res.status_code == 200, res.text
    assert res.json()["data"]["image"] != item["data"]["image"]
    assert res.json()["data"]["title"] == "Robin"
    assert not old.exists()

    # Deleting the category removes its items' images.
    newer = tmp_path / "images" / res.json()["data"]["image"]
    client.delete(f"/api/categories/{cat['id']}")
    assert not newer.exists()


def test_unknown_field_is_rejected(client):
    cat = make_category(client)
    res = client.post(f"/api/categories/{cat['id']}/items", data={"data": json.dumps({"colour": "red"})})
    assert res.status_code == 422


def test_bulk_upload_names_items_after_files(client):
    cat = make_category(client)
    files = [("images", (f"{n}.png", png(), "image/png")) for n in ("blue_tit", "great-tit")]
    res = client.post(f"/api/categories/{cat['id']}/items/images", files=files)
    assert res.status_code == 201, res.text
    assert [i["data"]["title"] for i in res.json()] == ["blue tit", "great tit"]
    assert [i["position"] for i in res.json()] == [1, 2]


def test_reorder_and_edit_items(client):
    cat = make_category(client, template="quote")
    a = add_item(client, cat["id"], {"text": "First", "title": "A"})
    b = add_item(client, cat["id"], {"text": "Second"})
    client.put(f"/api/categories/{cat['id']}/items/order", json={"item_ids": [b["id"], a["id"]]})
    assert [i["data"]["text"] for i in client.get(f"/api/categories/{cat['id']}/items").json()] == ["Second", "First"]

    res = client.patch(f"/api/items/{a['id']}", data={"data": json.dumps({"text": "Edited", "title": ""}), "enabled": "false"})
    assert res.json()["data"] == {"text": "Edited"} and res.json()["enabled"] is False


def test_empty_item_is_rejected(client):
    cat = make_category(client)
    assert client.post(f"/api/categories/{cat['id']}/items", data={"data": "{}"}).status_code == 422


def test_wrong_image_type_is_rejected(client):
    cat = make_category(client)
    res = client.post(
        f"/api/categories/{cat['id']}/items", files=[("image:image", ("a.txt", b"hello", "text/plain"))]
    )
    assert res.status_code == 415


def test_image_path_cannot_escape(client):
    assert client.get("/images/peek.db").status_code == 404
    assert not client.get("/images/..%2Fpeek.db").content.startswith(b"SQLite")


def test_csv_preview_matches_columns_and_guesses_types(client):
    cat = make_category(client, template="quote")
    csv = "Text;Title;Year;Link\n\"Here's looking at you, kid.\";Casablanca;1942;https://example.com/c\nMay the Force be with you.;Star Wars;1977;https://example.com/s\n"
    res = client.post(f"/api/categories/{cat['id']}/import/preview", files={"file": ("q.csv", csv.encode(), "text/csv")})
    assert res.status_code == 200, res.text
    cols = res.json()["columns"]
    assert [(c["name"], c["field"]) for c in cols] == [("Text", "text"), ("Title", "title"), ("Year", None), ("Link", None)]
    assert [c["type"] for c in cols[2:]] == ["number", "link"]
    assert res.json()["rows"] == 2


def test_csv_import_adds_fields_and_items(client, monkeypatch):
    from peek import csv_import

    monkeypatch.setattr(csv_import, "download_images", lambda urls, allowed: {
        u: ((png(), ".png") if "good" in u else None) for u in urls
    })
    cat = make_category(client, template="sprite")
    csv = (
        "Name,Sprite,No.,Notes\n"
        "Pikachu,https://img.example/good/25.png,25,Electric\n"
        "Missingno,https://img.example/bad.png,0,\n"
        ",,,\n"
    )
    mapping = [{"field": "title"}, {"field": "image"}, {"new": {"label": "No.", "type": "number"}}, None]
    res = client.post(
        f"/api/categories/{cat['id']}/import",
        files={"file": ("p.csv", csv.encode("utf-8-sig"), "text/csv")},
        data={"mapping": json.dumps(mapping)},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["created"] == 2 and body["images_failed"] == 1
    assert body["category"]["fields"][-1] == {"key": "no", "label": "No.", "type": "number"}
    items = client.get(f"/api/categories/{cat['id']}/items").json()
    assert items[0]["data"]["title"] == "Pikachu" and items[0]["data"]["no"] == "25"
    assert items[0]["data"]["image"].endswith(".png")
    assert "image" not in items[1]["data"]


def test_unplaced_fields_get_their_own_class(client):
    from peek import layouts

    fields = layouts.TEMPLATE_INFO["quote"]["fields"] + [{"key": "year", "label": "Year", "type": "number"}]
    html = layouts.build("quote", fields, {"text": "Hi", "title": "Me", "year": "1942"})
    assert 'class="text field field-text type-long_text"' in html
    assert 'class="field field-year type-number"' in html


def test_slots_can_be_reassigned(client):
    from peek import layouts

    fields = [{"key": "name", "label": "Name", "type": "text"}, {"key": "quote", "label": "Quote", "type": "long_text"}]
    auto = layouts.resolve_slots("quote", fields, {})
    assert auto == {"text": "name", "title": "quote"}
    chosen = layouts.resolve_slots("quote", fields, {"text": "quote", "title": "name"})
    assert chosen == {"text": "quote", "title": "name"}
    assert layouts.resolve_slots("quote", fields, {"title": None})["title"] is None


def frame_pixel(client, x=5, y=5):
    img = Image.open(io.BytesIO(client.get("/frame.png").content)).convert("RGB")
    return tuple(np.asarray(img)[y, x])


def test_preview_uses_unsaved_css_and_show_sets_frame(client):
    cat = make_category(client, template="quote", custom_css="body { background: var(--blue); }")
    item = add_item(client, cat["id"], {"text": "Hi"})

    res = client.post(
        f"/api/categories/{cat['id']}/preview.png",
        params={"view": "panel"},
        json={"custom_css": "body { background: var(--green); }"},
    )
    img = np.asarray(Image.open(io.BytesIO(res.content)).convert("RGB"))
    assert tuple(img[5, 5]) == (0, 255, 0)

    assert client.post(f"/api/items/{item['id']}/show").status_code == 200
    assert frame_pixel(client) == (0, 0, 255)


def test_preview_without_items_uses_placeholder(client):
    cat = make_category(client, template="sprite")
    res = client.post(f"/api/categories/{cat['id']}/preview.png", json={})
    assert res.status_code == 200
    assert Image.open(io.BytesIO(res.content)).size == (800, 480)


def test_orientation_setting(client):
    assert client.get("/api/settings").json()["orientation"] == "landscape"
    assert client.patch("/api/settings", json={"orientation": "sideways"}).status_code == 422
    res = client.patch("/api/settings", json={"orientation": "portrait"})
    assert res.json()["orientation"] == "portrait"
    assert client.get("/api/settings").json()["orientation"] == "portrait"


def test_portrait_previews_upright_and_frame_gets_turned(client):
    # A quote with a red band across the top of the upright picture.
    css = "body { border-top: 40px solid var(--red); }"
    cat = make_category(client, template="quote", custom_css=css)
    item = add_item(client, cat["id"], {"text": "Hi"})
    client.post(f"/api/items/{item['id']}/show")
    assert frame_pixel(client, x=400, y=5) == (255, 0, 0)

    client.patch("/api/settings", json={"orientation": "portrait"})

    preview = Image.open(io.BytesIO(client.get(f"/api/items/{item['id']}/preview.png").content))
    assert preview.size == (480, 800)
    # Changing the orientation redraws what the frame shows: still 800x480,
    # with the picture's top edge turned to the panel's left edge.
    frame = Image.open(io.BytesIO(client.get("/frame.png").content))
    assert frame.size == (800, 480)
    assert frame_pixel(client, x=5, y=240) == (255, 0, 0)
    assert frame_pixel(client, x=400, y=5) != (255, 0, 0)
    assert Image.open(io.BytesIO(client.get("/frame/preview.png").content)).size == (480, 800)


def test_mono_style_previews_in_black_and_white(client):
    cat = make_category(client, template="quote", custom_css="body { background: var(--blue); }")
    res = client.post(f"/api/categories/{cat['id']}/preview.png", params={"view": "panel"}, json={"mono": True})
    img = Image.open(io.BytesIO(res.content)).convert("RGB")
    assert {c for _, c in img.getcolors()} <= {(0, 0, 0), (255, 255, 255)}

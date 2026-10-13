import io

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


def test_templates_are_listed(client):
    names = [t["name"] for t in client.get("/api/templates").json()]
    assert names == ["photo", "quote", "sprite"]


def test_category_crud(client):
    cat = make_category(client, custom_css=".caption { color: red; }")
    assert cat["item_count"] == 0 and cat["enabled"] is True

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


def test_items_with_images(client, tmp_path):
    cat = make_category(client)
    res = client.post(
        f"/api/categories/{cat['id']}/items",
        data={"title": "Robin"},
        files=[("images", ("robin.png", png(), "image/png"))],
    )
    assert res.status_code == 201, res.text
    item = res.json()[0]
    assert item["title"] == "Robin" and item["image"].endswith(".png")
    assert client.get(f"/images/{item['image']}").content == png()

    # Replacing the image removes the old file.
    old = tmp_path / "images" / item["image"]
    res = client.patch(f"/api/items/{item['id']}", files={"image": ("new.png", png((0, 0, 255)), "image/png")})
    assert res.json()["image"] != item["image"]
    assert not old.exists()

    # Deleting the category removes its items' images.
    newer = tmp_path / "images" / res.json()["image"]
    client.delete(f"/api/categories/{cat['id']}")
    assert not newer.exists()


def test_bulk_upload_names_items_after_files(client):
    cat = make_category(client)
    files = [("images", (f"{n}.png", png(), "image/png")) for n in ("blue_tit", "great-tit")]
    res = client.post(f"/api/categories/{cat['id']}/items", files=files)
    assert [i["title"] for i in res.json()] == ["blue tit", "great tit"]
    assert [i["position"] for i in res.json()] == [1, 2]


def test_reorder_and_edit_items(client):
    cat = make_category(client, template="quote")
    a = client.post(f"/api/categories/{cat['id']}/items", data={"text": "First"}).json()[0]
    b = client.post(f"/api/categories/{cat['id']}/items", data={"text": "Second"}).json()[0]
    client.put(f"/api/categories/{cat['id']}/items/order", json={"item_ids": [b["id"], a["id"]]})
    assert [i["text"] for i in client.get(f"/api/categories/{cat['id']}/items").json()] == ["Second", "First"]

    res = client.patch(f"/api/items/{a['id']}", data={"text": "Edited", "enabled": "false"})
    assert res.json()["text"] == "Edited" and res.json()["enabled"] is False


def test_empty_item_is_rejected(client):
    cat = make_category(client)
    assert client.post(f"/api/categories/{cat['id']}/items", data={}).status_code == 422


def test_wrong_image_type_is_rejected(client):
    cat = make_category(client)
    res = client.post(
        f"/api/categories/{cat['id']}/items", files=[("images", ("a.txt", b"hello", "text/plain"))]
    )
    assert res.status_code == 415


def test_image_path_cannot_escape(client):
    assert client.get("/images/peek.db").status_code == 404
    assert not client.get("/images/..%2Fpeek.db").content.startswith(b"SQLite")


def frame_pixel(client, x=5, y=5):
    img = Image.open(io.BytesIO(client.get("/frame.png").content)).convert("RGB")
    return tuple(np.asarray(img)[y, x])


def test_preview_uses_unsaved_css_and_show_sets_frame(client):
    cat = make_category(client, template="quote", custom_css="body { background: var(--blue); }")
    item = client.post(f"/api/categories/{cat['id']}/items", data={"text": "Hi"}).json()[0]

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
    item = client.post(f"/api/categories/{cat['id']}/items", data={"text": "Hi"}).json()[0]
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

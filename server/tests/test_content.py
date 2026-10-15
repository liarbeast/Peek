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
    body = {"name": "Birds", **fields}
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
    assert names == ["canvas"]


def test_category_crud(client):
    cat = make_category(client)
    assert cat["item_count"] == 0 and cat["enabled"] is True
    assert cat["template"] == "canvas"
    assert [f["key"] for f in cat["fields"]] == ["image", "title", "subtext"]

    res = client.patch(f"/api/categories/{cat['id']}", json={"name": "Garden birds", "item_order": "shuffle"})
    assert res.json()["name"] == "Garden birds"
    assert res.json()["item_order"] == "shuffle"

    assert [c["name"] for c in client.get("/api/categories").json()] == ["Garden birds"]
    assert client.delete(f"/api/categories/{cat['id']}").status_code == 204
    assert client.get(f"/api/categories/{cat['id']}").status_code == 404


def test_unknown_template_and_order_are_rejected(client):
    assert client.post("/api/categories", json={"name": "X", "template": "nope"}).status_code == 422
    cat = make_category(client)
    assert client.patch(f"/api/categories/{cat['id']}", json={"item_order": "sideways"}).status_code == 422


def test_copy_category_takes_fields_and_style(client):
    src = make_category(client)
    client.patch(f"/api/categories/{src['id']}", json={
        "fields": src["fields"] + [{"label": "Year", "type": "text"}],
        "positions": {"landscape": {"title": {"x": 1, "y": 2, "w": 300, "h": 40, "color": "red"}}},
    })
    res = client.post("/api/categories", json={"name": "More quotes", "copy_from": src["id"]})
    assert res.status_code == 201
    copy = res.json()
    assert copy["positions"]["landscape"]["title"]["color"] == "red"
    assert [f["key"] for f in copy["fields"]] == ["image", "title", "subtext", "year"]


def test_field_editing(client):
    cat = make_category(client)
    fields = cat["fields"] + [{"label": "Pokédex no.", "type": "text"}, {"label": "Year", "type": "text"}]
    res = client.patch(f"/api/categories/{cat['id']}", json={"fields": fields})
    assert res.status_code == 200, res.text
    assert [f["key"] for f in res.json()["fields"]] == ["image", "title", "subtext", "pokedex-no", "year"]

    # Renaming keeps the key, so CSS that targets .field-year keeps working.
    fields = res.json()["fields"]
    fields[4]["label"] = "Released"
    res = client.patch(f"/api/categories/{cat['id']}", json={"fields": fields})
    assert res.json()["fields"][4] == {"key": "year", "label": "Released", "type": "text"}

    bad = [{"label": "", "type": "text"}]
    assert client.patch(f"/api/categories/{cat['id']}", json={"fields": bad}).status_code == 422
    bad = [{"label": "X", "type": "number"}]
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
    cat = make_category(client)
    a = add_item(client, cat["id"], {"title": "First", "subtext": "A"})
    b = add_item(client, cat["id"], {"title": "Second"})
    client.put(f"/api/categories/{cat['id']}/items/order", json={"item_ids": [b["id"], a["id"]]})
    assert [i["data"]["title"] for i in client.get(f"/api/categories/{cat['id']}/items").json()] == ["Second", "First"]

    res = client.patch(f"/api/items/{a['id']}", data={"data": json.dumps({"title": "Edited", "subtext": ""}), "enabled": "false"})
    assert res.json()["data"] == {"title": "Edited"} and res.json()["enabled"] is False


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
    cat = make_category(client)
    csv = "Title;Subtext;Year;Link\n\"Here's looking at you, kid.\";Casablanca;1942;https://example.com/c\nMay the Force be with you.;Star Wars;1977;https://example.com/s\n"
    res = client.post(f"/api/categories/{cat['id']}/import/preview", files={"file": ("q.csv", csv.encode(), "text/csv")})
    assert res.status_code == 200, res.text
    cols = res.json()["columns"]
    assert [(c["name"], c["field"]) for c in cols] == [("Title", "title"), ("Subtext", "subtext"), ("Year", None), ("Link", None)]
    assert [c["type"] for c in cols[2:]] == ["text", "text"]
    assert res.json()["rows"] == 2


def test_csv_import_adds_fields_and_items(client, monkeypatch):
    from peek import csv_import

    monkeypatch.setattr(csv_import, "download_images", lambda urls, allowed: {
        u: ((png(), ".png") if "good" in u else None) for u in urls
    })
    cat = make_category(client)
    csv = (
        "Name,Sprite,No.,Notes\n"
        "Pikachu,https://img.example/good/25.png,25,Electric\n"
        "Missingno,https://img.example/bad.png,0,\n"
        ",,,\n"
    )
    mapping = [{"field": "title"}, {"field": "image"}, {"new": {"label": "No.", "type": "text"}}, None]
    res = client.post(
        f"/api/categories/{cat['id']}/import",
        files={"file": ("p.csv", csv.encode("utf-8-sig"), "text/csv")},
        data={"mapping": json.dumps(mapping)},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["created"] == 2 and body["images_failed"] == 1
    assert body["category"]["fields"][-1] == {"key": "no", "label": "No.", "type": "text"}
    items = client.get(f"/api/categories/{cat['id']}/items").json()
    assert items[0]["data"]["title"] == "Pikachu" and items[0]["data"]["no"] == "25"
    assert items[0]["data"]["image"].endswith(".png")
    assert "image" not in items[1]["data"]


def test_every_field_gets_its_own_class(client):
    from peek import layouts

    fields = layouts.TEMPLATE_INFO["canvas"]["fields"] + [{"key": "year", "label": "Year", "type": "text"}]
    html = layouts.build("canvas", fields, {"title": "Casablanca", "year": "1942"})
    assert 'class="field field-title type-text"' in html
    assert 'class="field field-year type-text"' in html
    assert 'class="field field-image' not in html  # empty fields are left out


def frame_pixel(client, x=5, y=5):
    img = Image.open(io.BytesIO(client.get("/frame.png").content)).convert("RGB")
    return tuple(np.asarray(img)[y, x])


def colours(png_bytes: bytes) -> set:
    return {c for _, c in Image.open(io.BytesIO(png_bytes)).convert("RGB").getcolors(1 << 20)}


def test_preview_uses_unsaved_style_and_show_sets_frame(client):
    cat = make_category(client)
    item = add_item(client, cat["id"], {"title": "Hi"}, images={"image": png((255, 0, 0))})

    res = client.post(f"/api/categories/{cat['id']}/preview.png", params={"view": "panel"}, json={"mono": True})
    assert colours(res.content) <= {(0, 0, 0), (255, 255, 255)}

    assert client.post(f"/api/items/{item['id']}/show").status_code == 200
    assert (255, 0, 0) in colours(client.get("/frame.png").content)


def test_preview_without_items_uses_placeholder(client):
    cat = make_category(client)
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
    # A red band across the top of the upright picture.
    cat = make_category(client)
    band = {"x": 0, "y": 0, "align": "center", "valign": "top"}
    client.patch(f"/api/categories/{cat['id']}", json={"positions": {
        "landscape": {"image": {**band, "w": 800, "h": 40}}, "portrait": {"image": {**band, "w": 480, "h": 24}}}})
    item = add_item(client, cat["id"], {"title": "Hi"}, images={"image": png((255, 0, 0), size=(1000, 50))})
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
    cat = make_category(client)
    add_item(client, cat["id"], {"title": "Hi"}, images={"image": png((0, 0, 255))})
    res = client.post(f"/api/categories/{cat['id']}/preview.png", params={"view": "panel"}, json={"mono": True})
    assert colours(res.content) <= {(0, 0, 0), (255, 255, 255)}


def boxes(res) -> dict:
    assert res.status_code == 200, res.text
    return json.loads(res.headers["X-Peek-Boxes"])


def test_dragged_fields_get_their_box(client):
    cat = make_category(client)
    add_item(client, cat["id"], {"title": "Robin", "subtext": "Garden bird"})
    url = f"/api/categories/{cat['id']}/preview.png"

    # Every field starts with a box: one under the other, each attached below
    # the one before. The preview says where they ended up.
    defaults = cat["positions"]["landscape"]
    assert cat["default_positions"] == cat["positions"]
    assert defaults["title"]["weight"] == 700 and defaults["subtext"]["below"] == "title"
    assert set(cat["positions"]) == {"landscape", "portrait"}
    start = boxes(client.post(url, json={}))
    assert set(start) == {"title", "subtext"}  # the image is empty
    assert start["title"][1] == 40  # the empty image takes no room

    title = {"x": 20, "y": 30, "w": 300, "h": 60, "size": 30}
    res = client.patch(f"/api/categories/{cat['id']}", json={"positions": {"landscape": {"title": title}}})
    assert res.json()["positions"]["landscape"]["title"] == title
    assert res.json()["positions"]["landscape"]["subtext"] == defaults["subtext"]
    placed = boxes(client.post(url, json={}))
    assert placed["title"][:3] == [20, 30, 300]  # text is as tall as its lines
    assert placed["subtext"][1] == 30 + placed["title"][3] + 16  # still attached below the title

    # Unsaved positions can be previewed; portrait has its own.
    draft = {"landscape": {"subtext": {"x": 400, "y": 400, "w": 200, "h": 40}}}
    assert boxes(client.post(url, json={"positions": draft}))["subtext"][:3] == [400, 400, 200]
    client.patch("/api/settings", json={"orientation": "portrait"})
    assert boxes(client.post(url, json={}))["title"][:3] != [20, 30, 300]

    assert client.patch(f"/api/categories/{cat['id']}", json={
        "positions": {"landscape": {"title": {"x": 0, "y": 0, "w": 0, "h": 10}}}}).status_code == 422
    assert client.patch(f"/api/categories/{cat['id']}", json={
        "positions": {"sideways": {}}}).status_code == 422
    assert client.patch(f"/api/categories/{cat['id']}", json={
        "positions": {"landscape": {"title": {**title, "font": "Comic Sans"}}}}).status_code == 422

    copy = client.post("/api/categories", json={"name": "Copy", "copy_from": cat["id"]}).json()
    assert copy["positions"] == res.json()["positions"]


def test_placed_field_style():
    from peek import layouts

    fields = [{"key": "title", "label": "Title", "type": "text"}, {"key": "pic", "label": "Pic", "type": "image"}]
    values = {"title": "Robin", "pic": "data:image/png;base64,AA=="}
    html = layouts.build("canvas", fields, values, positions={
        "title": {"x": 1, "y": 2, "w": 300, "h": 60, "size": 50, "align": "right", "valign": "bottom", "z": 3,
                  "weight": 800, "color": "red", "font": "Alegreya"},
        "pic": {"x": 5, "y": 6, "w": 70, "h": 80, "align": "left", "valign": "top"},
    })
    # Text is as tall as its lines, so it gets no height; vertical alignment is for images.
    assert ('style="left:1px;top:2px;width:300px;text-align:right;font-size:50px;font-weight:800;'
            'color:var(--red);font-family:&#39;Alegreya&#39;,sans-serif;z-index:3"') in html
    assert 'style="left:5px;top:6px;width:70px;height:80px;object-position:left top"' in html


def test_placed_text_wraps_in_its_width():
    import numpy as np
    from peek import layouts, renderer

    fields = [{"key": "title", "label": "Title", "type": "text"}]
    long = "A rather long title for such a narrow box, long enough to wrap a few times"
    html = layouts.build("canvas", fields, {"title": long},
                         positions={"title": {"x": 20, "y": 20, "w": 200, "h": 8, "size": 30}})
    render = renderer.render(html)
    x, y, w, h, size = render.boxes["title"]
    assert (x, y, w, size) == (20, 20, 200, 30)
    assert h > 100  # as tall as its lines, whatever h was saved
    ink = np.asarray(render.raw.convert("L")) < 128
    assert ink[20:20 + h, 20:220].any()
    ink[20:20 + h, 20:220] = False
    assert not ink.any()  # nothing outside its width


def test_attached_field_follows_the_text_above(client):
    cat = make_category(client)
    url = f"/api/categories/{cat['id']}/preview.png"
    positions = {"landscape": {
        "title": {"x": 20, "y": 20, "w": 300, "h": 40, "size": 30},
        "subtext": {"x": 20, "y": 0, "w": 300, "h": 40, "below": "title", "gap": 12},
    }}
    found = {}
    for title in ("Robin", "Robin, the European garden bird"):
        item = add_item(client, cat["id"], {"title": title, "subtext": "Garden bird"})
        found[title] = boxes(client.post(url, json={"positions": positions, "item_id": item["id"]}))
    one, two = found["Robin"], found["Robin, the European garden bird"]
    assert one["subtext"][1] == one["title"][1] + one["title"][3] + 12  # 12px under the title's last line
    assert two["subtext"][1] == two["title"][1] + two["title"][3] + 12
    assert two["subtext"][1] - one["subtext"][1] > 25  # a second line pushed it down

    # Attached round in a circle, fields just stay put.
    loop = {"landscape": {"title": {"x": 0, "y": 0, "w": 100, "h": 50, "below": "subtext"},
                          "subtext": {"x": 0, "y": 60, "w": 100, "h": 50, "below": "title"}}}
    assert client.post(url, json={"positions": loop}).status_code == 200


def test_text_grows_from_the_edge_that_stays_put(client):
    cat = make_category(client)
    url = f"/api/categories/{cat['id']}/preview.png"
    short = add_item(client, cat["id"], {"title": "Robin", "subtext": "Garden bird"})
    long = add_item(client, cat["id"], {"title": "Robin, the European garden bird of " * 2, "subtext": "Garden bird"})

    def drawn(grow):
        positions = {"landscape": {
            "title": {"x": 20, "y": 200, "w": 300, "h": 40, "size": 30, "grow": grow},
            "subtext": {"x": 20, "y": 0, "w": 300, "h": 40, "below": "title", "gap": 12, "grow": "up"},
        }}
        return [boxes(client.post(url, json={"positions": positions, "item_id": i["id"]})) for i in (short, long)]

    one, two = drawn("down")
    assert one["title"][1] == two["title"][1] == 200  # the top stays put
    one, two = drawn("up")
    assert one["title"][1] + one["title"][3] == two["title"][1] + two["title"][3] == 240  # the bottom stays put
    assert two["title"][1] < one["title"][1]  # more lines went up
    one, two = drawn("middle")
    assert abs(one["title"][1] + one["title"][3] / 2 - 220) <= 1  # the centre stays put
    assert abs(two["title"][1] + two["title"][3] / 2 - 220) <= 1
    for found in drawn("up") + drawn("middle"):
        # Attached below: 12px under the title's real bottom edge, hanging from its own top.
        assert found["subtext"][1] == found["title"][1] + found["title"][3] + 12


def test_attached_to_an_empty_field_takes_its_place(client):
    cat = make_category(client)
    item = add_item(client, cat["id"], {"title": "Robin", "subtext": "Garden bird"})  # no image
    positions = {"landscape": {
        "image": {"x": 0, "y": 100, "w": 200, "h": 200},
        "title": {"x": 0, "y": 0, "w": 300, "h": 40, "below": "image", "gap": 10},
    }}
    found = boxes(client.post(f"/api/categories/{cat['id']}/preview.png",
                              json={"positions": positions, "item_id": item["id"]}))
    assert found["title"][1] == 100  # where the image would have been


def test_delete_all_items(client):
    cat = make_category(client)
    other = make_category(client)
    for n in range(3):
        add_item(client, cat["id"], {"title": f"Bird {n}"}, images={"image": png()})
    add_item(client, other["id"], {"title": "Kept"})
    assert client.delete(f"/api/categories/{cat['id']}/items").status_code == 204
    assert client.get(f"/api/categories/{cat['id']}/items").json() == []
    assert len(client.get(f"/api/categories/{other['id']}/items").json()) == 1
    assert client.delete("/api/categories/999/items").status_code == 404


def test_hidden_field_is_kept_but_not_drawn(client):
    cat = make_category(client)
    item = add_item(client, cat["id"], {"title": "Robin", "subtext": "Garden bird"})
    fields = [{**f, "hidden": f["key"] == "title"} for f in cat["fields"]]
    cat = client.patch(f"/api/categories/{cat['id']}", json={"fields": fields}).json()
    assert [f.get("hidden", False) for f in cat["fields"]] == [f["key"] == "title" for f in cat["fields"]]
    items = client.get(f"/api/categories/{cat['id']}/items").json()
    assert items[0]["data"]["title"] == "Robin"  # value kept
    positions = {"landscape": {
        "title": {"x": 0, "y": 100, "w": 300, "h": 40},
        "subtext": {"x": 0, "y": 0, "w": 300, "h": 40, "below": "title", "gap": 10},
    }}
    found = boxes(client.post(f"/api/categories/{cat['id']}/preview.png",
                              json={"positions": positions, "item_id": item["id"]}))
    assert "title" not in found
    assert found["subtext"][1] == 100  # takes the hidden title's place


def test_fonts_are_downloaded_once_and_inlined(tmp_path):
    from peek import fonts

    sheet = (
        "/* cyrillic */\n@font-face {\n  font-family: 'Alegreya';\n  src: url(https://fonts.gstatic.com/c.woff2) format('woff2');\n}\n"
        "/* latin */\n@font-face {\n  font-family: 'Alegreya';\n  src: url(https://fonts.gstatic.com/l.woff2) format('woff2');\n}\n"
    )
    fetched = []

    def fetch(url):
        fetched.append(url)
        return sheet.encode() if "googleapis" in url else b"font"

    cache = fonts.FontCache(tmp_path, fetch)
    css = cache.css("Alegreya", 800)
    assert "data:font/woff2;base64,Zm9udA==" in css and "c.woff2" not in css
    assert "family=Alegreya%3Awght%40800" in fetched[0]
    assert cache.css("Alegreya", 800) == css and len(fetched) == 2  # the second time comes from disk
    assert cache.css("Comic Sans") == ""
    assert cache.css("Alegreya", 100) == "" and len(fetched) == 2  # a weight it doesn't come in

    def offline(url):
        raise OSError("no network")

    assert fonts.FontCache(tmp_path / "other", offline).css("Ubuntu") == ""


def test_style_images(client, tmp_path):
    cat = make_category(client)
    item = add_item(client, cat["id"], {"title": "Robin"})
    url = f"/api/categories/{cat['id']}/images"
    frame = client.post(url, files={"file": ("pokedex frame.png", png((255, 0, 0), (800, 480)), "image/png")}).json()
    assert frame["name"] == "pokedex frame" and frame["crisp"] is True
    photo = client.post(url, files={"file": ("sky.jpg", png(), "image/jpeg")}).json()
    assert photo["crisp"] is False
    assert [i["key"] for i in client.get(url).json()] == [frame["key"], photo["key"]]
    assert client.patch(f"/api/category-images/{photo['id']}", json={"crisp": True}).json()["crisp"] is True
    assert client.delete(f"/api/category-images/{photo['id']}").status_code == 204

    # It covers the whole page behind the fields until it is dragged somewhere.
    preview = f"/api/categories/{cat['id']}/preview.png"
    found = boxes(client.post(preview, json={"item_id": item["id"]}))
    assert found[frame["key"]][:4] == [0, 0, 800, 480]
    # Behind the fields, but in front of the page's own white background.
    panel = client.post(preview, params={"view": "panel"}, json={"item_id": item["id"]}).content
    assert (255, 0, 0) in colours(panel)
    small = {"landscape": {frame["key"]: {"x": 10, "y": 20, "w": 100, "h": 60}}}
    assert boxes(client.post(preview, json={"positions": small}))[frame["key"]][:4] == [10, 20, 100, 60]

    # A copy gets its own copy of the image, with the box moved to its key.
    client.patch(f"/api/categories/{cat['id']}", json={"positions": small})
    copy = client.post("/api/categories", json={"name": "Copy", "copy_from": cat["id"]}).json()
    [copied] = client.get(f"/api/categories/{copy['id']}/images").json()
    assert copied["file"] != frame["file"]
    assert copy["positions"]["landscape"][copied["key"]]["x"] == 10

    images = tmp_path / "images"
    assert (images / frame["file"]).exists()
    client.delete(f"/api/categories/{cat['id']}")
    assert not (images / frame["file"]).exists() and (images / copied["file"]).exists()


def test_font_list(client):
    weights = client.get("/api/fonts").json()
    assert weights["Poppins"] == [100, 200, 300, 400, 500, 600, 700, 800, 900]
    assert weights["Jacquard 12"] == [400]

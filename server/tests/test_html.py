"""A category's own HTML, Tailwind classes and decoration images."""

import io

import numpy as np
from PIL import Image

from peek import layouts, renderer, samples

from test_content import add_item, client, make_category, png  # noqa: F401


def panel(res) -> np.ndarray:
    assert res.status_code == 200, res.text
    return np.asarray(Image.open(io.BytesIO(res.content)).convert("RGB"))


def preview(client, cat, **changes) -> np.ndarray:
    return panel(client.post(f"/api/categories/{cat['id']}/preview.png", params={"view": "panel"}, json=changes))


def upload(client, cat, content, filename="frame.png", mime="image/png", **form):
    res = client.post(f"/api/categories/{cat['id']}/images", files={"file": (filename, content, mime)}, data=form)
    assert res.status_code == 201, res.text
    return res.json()


def test_own_html_places_fields_and_takes_tailwind_classes(client):
    cat = make_category(client)
    add_item(client, cat["id"], {"title": "Pikachu"})
    html = '<div class="h-full bg-red p-8"><h1 class="bg-yellow text-blue">{{ title }}</h1>{{ missing }}</div>'
    img = preview(client, cat, custom_html=html)
    assert tuple(img[5, 5]) == (255, 0, 0)  # bg-red is the panel's red
    assert tuple(img[36, 600]) == (255, 255, 0)  # the heading, a full-width block inside p-8


def test_custom_css_beats_tailwind(client):
    cat = make_category(client)
    img = preview(client, cat, custom_html='<div class="box h-full bg-red"></div>',
                  custom_css=".box { background: var(--green); }")
    assert tuple(img[5, 5]) == (0, 255, 0)


def test_broken_html_is_rejected_with_its_line(client):
    cat = make_category(client)
    res = client.patch(f"/api/categories/{cat['id']}", json={"custom_html": "<p>\n{% if title %}</p>"})
    assert res.status_code == 422
    assert "line 2" in res.json()["detail"]
    res = client.post(f"/api/categories/{cat['id']}/preview.png", json={"custom_html": "{{ title"})
    assert res.status_code == 422


def test_item_text_is_escaped(client):
    cat = make_category(client)
    add_item(client, cat["id"], {"title": '<div style="position:fixed;inset:0;background:red"></div>'})
    img = preview(client, cat, custom_html="<p>{{ title }}</p>")
    assert tuple(img[400, 700]) == (255, 255, 255)


def test_scripts_and_network_are_blocked():
    html = layouts.build(
        "stack", [], {},
        custom_html='<script>document.body.style.background = "red"</script>'
        '<div style="width:100%;height:100%;background:url(https://example.com/x.png) red"></div>',
    )
    raw, _, _ = renderer.screenshot(html, resources={})
    # The script never ran; the div is red because its image never loaded.
    assert raw.getpixel((5, 5)) == (255, 0, 0)


def test_decoration_images(client, tmp_path):
    cat = make_category(client)
    frame = upload(client, cat, png((255, 255, 0)), filename="Pokédex frame.png")
    assert frame["name"] == "pokedex_frame" and frame["crisp"] is True
    photo = upload(client, cat, samples.sunset_photo(), filename="sky.jpg", mime="image/jpeg")
    assert photo["crisp"] is False
    again = upload(client, cat, png(), filename="frame.png", name="pokedex frame")
    assert again["name"] == "pokedex_frame_2"
    assert [i["name"] for i in client.get(f"/api/categories/{cat['id']}/images").json()] == [
        "pokedex_frame", "pokedex_frame_2", "sky"]

    # Usable in HTML and in CSS.
    img = preview(client, cat, custom_html='<img src="{{ images.pokedex_frame }}" style="width:100%;height:100%">')
    assert tuple(img[240, 400]) == (255, 255, 0)
    img = preview(client, cat, custom_css="body { background: var(--image-pokedex_frame); }")
    assert tuple(img[240, 5]) == (255, 255, 0)

    # Renaming checks the name.
    url = f"/api/category-images/{again['id']}"
    assert client.patch(url, json={"name": "Bad name"}).status_code == 422
    assert client.patch(url, json={"name": "sky"}).status_code == 422
    assert client.patch(url, json={"name": "border", "crisp": False}).json() == {**again, "name": "border",
                                                                                "crisp": False}

    # Copies get their own files; deleting removes them.
    copy = client.post("/api/categories", json={"name": "Copy", "copy_from": cat["id"]}).json()
    copied = client.get(f"/api/categories/{copy['id']}/images").json()
    assert {i["name"] for i in copied} == {"pokedex_frame", "border", "sky"}
    assert not {i["file"] for i in copied} & {frame["file"], photo["file"], again["file"]}
    assert client.delete(url).status_code == 204
    assert not (tmp_path / "images" / again["file"]).exists()
    client.delete(f"/api/categories/{copy['id']}")
    assert not any((tmp_path / "images" / i["file"]).exists() for i in copied)


def test_crisp_decorations_are_not_dithered():
    url = layouts.image_url("sky.jpg")
    html = layouts.build("stack", [], {}, custom_html=f'<img src="{url}" style="width:100%;height:100%">')
    for crisp in (False, True):
        resources = {url: renderer.Resource(samples.sunset_photo(), "image/png", crisp)}
        _, photos, _ = renderer.screenshot(html, resources=resources)
        assert photos.any() != crisp


def test_photo_backgrounds_dither_only_on_empty_elements():
    url = layouts.image_url("sky.jpg")
    resources = {url: renderer.Resource(samples.sunset_photo(), "image/png", False)}
    for inside, dithered in (("", True), ("Caption", False)):
        html = layouts.build("stack", [], {}, custom_html=(
            f'<div style="width:100%;height:100%;background:url({url}) center/cover">{inside}</div>'))
        _, photos, _ = renderer.screenshot(html, resources=resources)
        assert photos.any() == dithered

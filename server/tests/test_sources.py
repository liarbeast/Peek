import json
from datetime import date

import httpx
import pytest
from fastapi.testclient import TestClient

from peek import sources
from peek.app import create_app

ON_THIS_DAY = {"selected": [
    {"year": 1066, "text": "Battle of Hastings", "pages": [{"titles": {"normalized": "Hastings"}}]},
    {"year": 1969, "pages": []},
    {"nothing": 1},
]}
SOURCE = {"url": "https://example.org/onthisday/{MM}/{DD}", "items": "selected",
          "fields": {"year": "year", "text": "text", "article": "pages.0.titles.normalized"}}


def test_entries_follow_the_paths():
    assert sources.entries(ON_THIS_DAY, SOURCE) == [
        {"year": "1066", "text": "Battle of Hastings", "article": "Hastings"},
        {"year": "1969"},
    ]
    assert sources.entries({"temp": 12}, {"fields": {"t": "temp"}}) == [{"t": "12"}]  # one object, one item
    with pytest.raises(sources.SourceError):
        sources.entries({"x": 1}, {"items": "selected"})
    assert sources.url_for(SOURCE["url"], date(2026, 3, 4)) == "https://example.org/onthisday/03/04"
    assert 1 <= int(sources.url_for("{RANDOM:1-3}", date.today())) <= 3
    assert 5 <= int(sources.url_for("{RANDOM:9-5}", date.today())) <= 9  # either way round


def test_every_wake_fetches_and_keeps_known_entries(tmp_path, monkeypatch):
    calls = []

    def fake_get(url, **kwargs):
        calls.append(url)
        return httpx.Response(200, json=ON_THIS_DAY, request=httpx.Request("GET", url))

    monkeypatch.setattr(sources.httpx, "get", fake_get)
    client = TestClient(create_app(tmp_path))
    cat = client.post("/api/categories", json={"name": "On this day"}).json()
    fields = [{"label": "Year"}, {"label": "Text"}, {"label": "Article"}]
    cat = client.patch(f"/api/categories/{cat['id']}", json={"fields": fields}).json()
    keys = [f["key"] for f in cat["fields"]]
    source = {**SOURCE, "fields": dict(zip(keys, SOURCE["fields"].values()))}
    assert client.patch(f"/api/categories/{cat['id']}", json={"source": source}).json()["source"] == source

    assert client.post(f"/api/categories/{cat['id']}/sync").json()["created"] == 2
    assert client.post(f"/api/categories/{cat['id']}/sync").json()["created"] == 2  # replaced, not added
    assert len(client.get(f"/api/categories/{cat['id']}/items").json()) == 2

    current = tmp_path / "current.json"

    def wake(switch=False):
        data = json.loads(current.read_text())
        data["refresh_period"] = "earlier"
        if switch:
            data["switch_period"] = "earlier"
        current.write_text(json.dumps(data))
        client.get("/frame.png")
        return json.loads(current.read_text())

    client.get("/frame.png")  # every wake that shows it fetches it
    assert len(calls) == 3
    first = json.loads(current.read_text())
    assert first["category_id"] == cat["id"]
    second = wake()
    assert len(calls) == 4 and second["item_id"] != first["item_id"]  # unchanged entries: rotation carries on
    ON_THIS_DAY["selected"].insert(0, {"year": 2000, "text": "New"})
    try:
        wake()
        items = client.get(f"/api/categories/{cat['id']}/items").json()
        assert [i["data"]["year"] for i in items] == ["2000", "1066", "1969"]  # added, in the source's order
        assert second["item_id"] in [i["id"] for i in items]  # the old items are the same items
    finally:
        ON_THIS_DAY["selected"].pop(0)

    removed = client.patch(f"/api/categories/{cat['id']}", json={"source": {"url": ""}}).json()
    assert removed["source"] is None and removed["synced"] is None
    assert removed["item_count"] == 3  # the fetched items stay, now editable


def test_inspect_finds_the_list_and_its_values():
    assert sources.lists(ON_THIS_DAY) == [{"path": "selected", "count": 3}]
    assert sources.lists({"data": {"items": [{"a": 1}]}, "tags": ["x"]}) == [{"path": "data.items", "count": 1}]
    assert sources.values(ON_THIS_DAY["selected"][0]) == [
        {"path": "year", "example": "1066"},
        {"path": "text", "example": "Battle of Hastings"},
        {"path": "pages.0.titles.normalized", "example": "Hastings"},
    ]


def test_connect_makes_fields_from_the_picked_values(tmp_path, monkeypatch):
    monkeypatch.setattr(sources.httpx, "get", lambda url, **kw: httpx.Response(
        200, json=ON_THIS_DAY, request=httpx.Request("GET", url)))
    client = TestClient(create_app(tmp_path))
    cat = client.post("/api/categories", json={"name": "On this day"}).json()  # Image, Title, Subtext
    res = client.put(f"/api/categories/{cat['id']}/source", json={
        "url": SOURCE["url"], "items": "selected",
        "columns": [
            {"path": "text", "field": "title"},  # an existing field
            {"path": "year", "new": {"label": "Year"}},
            {"path": "pages.0.titles.normalized", "new": {"label": "Article"}},
        ],
    }).json()
    assert res["created"] == 2
    fields = res["category"]["fields"]
    assert [f["label"] for f in fields] == ["Title", "Year", "Article"]  # Image and Subtext went: unused
    assert res["category"]["source"]["fields"] == {"title": "text", "year": "year", "article": "pages.0.titles.normalized"}
    assert client.put(f"/api/categories/{cat['id']}/source", json={
        "url": SOURCE["url"], "columns": [{"path": "text"}]}).status_code == 422

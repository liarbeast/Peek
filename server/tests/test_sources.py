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


def test_sync_replaces_items_once_a_day(tmp_path, monkeypatch):
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

    client.get("/frame.png")  # synced today already: no new fetch
    assert len(calls) == 2
    item = json.loads((tmp_path / "current.json").read_text())
    assert item["category_id"] == cat["id"]

    removed = client.patch(f"/api/categories/{cat['id']}", json={"source": {"url": ""}}).json()
    assert removed["source"] is None and removed["synced"] is None
    assert removed["item_count"] == 2  # the fetched items stay, now editable

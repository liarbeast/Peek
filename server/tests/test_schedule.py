import json
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from peek import schedule
from peek.app import create_app


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(tmp_path))


def test_wakes_fall_on_round_times():
    now = datetime(2026, 10, 14, 21, 23, 40)  # a Wednesday
    assert schedule.next_wake("15m", now) == datetime(2026, 10, 14, 21, 30)
    assert schedule.next_wake("1h", now) == datetime(2026, 10, 14, 22, 0)
    assert schedule.next_wake("3h", now) == datetime(2026, 10, 15, 0, 0)
    assert schedule.next_wake("12h", now) == datetime(2026, 10, 15, 0, 0)
    assert schedule.next_wake("1d", now) == datetime(2026, 10, 15, 0, 0)
    assert schedule.next_wake("1w", now) == datetime(2026, 10, 19, 0, 0)  # Monday
    assert schedule.next_wake("nonsense", now) == datetime(2026, 10, 14, 22, 0)


def test_a_wake_just_before_a_boundary_skips_it():
    now = datetime(2026, 10, 14, 21, 59, 30)
    assert schedule.next_wake("1h", now) == datetime(2026, 10, 14, 23, 0)
    assert schedule.sleep_seconds("1h", now) == 3630


def test_refresh_setting(client):
    assert client.get("/api/settings").json()["refresh"] == "1h"
    assert client.patch("/api/settings", json={"refresh": "1d"}).json()["refresh"] == "1d"
    assert 60 <= int(client.get("/api/sleep").text) <= 86400 + 60
    assert client.patch("/api/settings", json={"refresh": "2m"}).status_code == 422


def test_each_refresh_shows_the_next_item_and_switches_category(tmp_path, client):
    def make(name, n):
        cat = client.post("/api/categories", json={"name": name}).json()
        return cat, [client.post(f"/api/categories/{cat['id']}/items", data={"data": json.dumps({"title": f"{name} {i}"})})
                     .json()["id"] for i in range(n)]

    def wake(switch=False):
        """Pretend a refresh period (and maybe a category period) has passed."""
        source = tmp_path / "current.json"
        if source.exists():
            data = json.loads(source.read_text())
            data["refresh_period"] = "earlier"
            if switch:
                data["switch_period"] = "earlier"
            source.write_text(json.dumps(data))
        client.get("/frame.png")
        return json.loads(source.read_text()).get("item_id")

    assert wake() is None  # nothing to show yet: the welcome page
    (_, (b1, b2)), (fish, (f1,)) = make("Birds", 2), make("Fish", 1)
    assert wake() == b1
    client.get("/frame.png")  # same period, same item
    assert wake() == b2
    assert wake() == b1
    assert wake(switch=True) == f1
    assert wake(switch=True) == b2  # Birds again, where it left off
    client.patch(f"/api/categories/{fish['id']}", json={"enabled": False})
    assert wake(switch=True) == b1  # Fish is off, so Birds stays


def test_switch_setting(client):
    assert client.get("/api/settings").json()["switch"] == "1d"
    assert client.patch("/api/settings", json={"switch": "1w"}).json()["switch"] == "1w"
    assert client.patch("/api/settings", json={"switch": "2m"}).status_code == 422
    # A longer refresh moves the switch up to the shortest choice that isn't shorter.
    assert client.patch("/api/settings", json={"switch": "30m", "refresh": "1h"}).json()["switch"] == "1h"
    assert client.patch("/api/settings", json={"refresh": "3h"}).json()["switch"] == "8h"
    assert client.patch("/api/settings", json={"refresh": "1w"}).json()["switch"] == "1w"
    assert client.patch("/api/settings", json={"switch": "1mo"}).json()["switch"] == "1mo"


def test_switch_periods():
    now = datetime(2026, 10, 14, 21, 23, 40)
    assert schedule.period_start("8h", now) == datetime(2026, 10, 14, 16, 0)
    assert schedule.period_start("1mo", now) == datetime(2026, 10, 1, 0, 0)


def test_switch_once_a_collection_is_finished(tmp_path, client):
    client.patch("/api/settings", json={"switch": "finished"})
    ids = {}
    for name, n in (("Birds", 2), ("Fish", 3)):
        cat = client.post("/api/categories", json={"name": name}).json()
        for i in range(n):
            item = client.post(f"/api/categories/{cat['id']}/items", data={"data": json.dumps({"title": "x"})}).json()
            ids[item["id"]] = name

    def wake():
        source = tmp_path / "current.json"
        if source.exists():
            source.write_text(json.dumps({**json.loads(source.read_text()), "refresh_period": "earlier"}))
        client.get("/frame.png")
        return ids[json.loads(source.read_text())["item_id"]]

    assert [wake() for _ in range(7)] == ["Birds"] * 2 + ["Fish"] * 3 + ["Birds"] * 2


def test_the_list_marks_the_collection_on_the_frame(client):
    cat = client.post("/api/categories", json={"name": "Birds"}).json()
    other = client.post("/api/categories", json={"name": "Fish"}).json()
    item = client.post(f"/api/categories/{cat['id']}/items", data={"data": json.dumps({"title": "Robin"})}).json()
    assert not any(c["current"] for c in client.get("/api/categories").json())
    client.post(f"/api/items/{item['id']}/show")
    assert {c["id"]: c["current"] for c in client.get("/api/categories").json()} == {cat["id"]: True, other["id"]: False}


def test_next_switch_is_the_first_wake_after_the_switch_time():
    now = datetime(2026, 10, 14, 21, 23, 40)  # a Wednesday
    assert schedule.next_switch("1d", "1h", now) == datetime(2026, 10, 15, 0, 0)
    assert schedule.next_switch("8h", "6h", now) == datetime(2026, 10, 15, 0, 0)  # 00:00 is both
    assert schedule.next_switch("8h", "3h", datetime(2026, 10, 14, 9, 0)) == datetime(2026, 10, 14, 18, 0)  # 16:00 -> wake at 18:00
    assert schedule.next_switch("1w", "1d", now) == datetime(2026, 10, 19, 0, 0)
    assert schedule.next_switch("1mo", "1h", now) == datetime(2026, 11, 1, 0, 0)


def test_the_current_collection_says_when_it_switches(client):
    cat = client.post("/api/categories", json={"name": "Birds"}).json()
    items = [client.post(f"/api/categories/{cat['id']}/items", data={"data": json.dumps({"title": t})}).json()
             for t in ("Robin", "Wren", "Owl")]
    client.post(f"/api/items/{items[0]['id']}/show")
    current = next(c for c in client.get("/api/categories").json() if c["current"])
    assert "at" in current["next_switch"]  # the default: every day
    client.patch("/api/settings", json={"switch": "finished"})
    current = next(c for c in client.get("/api/categories").json() if c["current"])
    assert current["next_switch"] == {"items_left": 2, "next": "Birds"}  # one of three shown; Birds is the only one
    client.post("/api/categories", json={"name": "Fish"})  # no items yet: not in rotation
    trees = client.post("/api/categories", json={"name": "Trees"}).json()
    client.post(f"/api/categories/{trees['id']}/items", data={"data": json.dumps({"title": "Oak"})})
    current = next(c for c in client.get("/api/categories").json() if c["current"])
    assert current["next_switch"]["next"] == "Trees"
    client.patch("/api/settings", json={"collection_order": "shuffle"})
    current = next(c for c in client.get("/api/categories").json() if c["current"])
    assert current["next_switch"] == {"items_left": 2, "shuffle": True}


def _rotation(tmp_path, client, names, wakes):
    """Make one-item collections and the categories the frame shows on each of `wakes` switching wakes."""
    ids = {}
    for name in names:
        cat = client.post("/api/categories", json={"name": name}).json()
        client.post(f"/api/categories/{cat['id']}/items", data={"data": json.dumps({"title": name})})
        ids[cat["id"]] = name

    def wakes_():
        source = tmp_path / "current.json"
        for _ in range(wakes):
            if source.exists():
                data = json.loads(source.read_text())
                source.write_text(json.dumps({**data, "refresh_period": "earlier", "switch_period": "earlier"}))
            client.get("/frame.png")
            yield ids[json.loads(source.read_text())["category_id"]]
    return ids, wakes_


def test_collections_go_in_the_order_set(tmp_path, client):
    ids, wakes = _rotation(tmp_path, client, ["Birds", "Fish", "Trees"], 4)
    by_name = {v: k for k, v in ids.items()}
    assert client.post("/api/categories/reorder", json={"category_ids": [by_name["Trees"], by_name["Birds"]]}).status_code == 204
    assert [c["name"] for c in client.get("/api/categories").json()] == ["Trees", "Birds", "Fish"]
    assert list(wakes()) == ["Trees", "Birds", "Fish", "Trees"]


def test_shuffle_gives_every_collection_a_turn_each_round(tmp_path, client):
    client.patch("/api/settings", json={"collection_order": "shuffle"})
    names = ["A", "B", "C", "D", "E"]
    _, wakes = _rotation(tmp_path, client, names, 15)
    shown = list(wakes())
    for start in (0, 5, 10):
        assert sorted(shown[start:start + 5]) == names  # each round: all five, once
    assert all(a != b for a, b in zip(shown, shown[1:]))  # never the same twice in a row
    assert client.patch("/api/settings", json={"collection_order": "random"}).status_code == 422

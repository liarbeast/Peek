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

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

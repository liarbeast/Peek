from fastapi.testclient import TestClient

from peek.app import battery_percent, create_app


def test_percent_follows_the_li_ion_curve():
    assert battery_percent(4.25) == 100
    assert battery_percent(4.2) == 100
    assert battery_percent(3.95) == 75
    assert battery_percent(3.3) == 0
    assert battery_percent(3.0) == 0


def test_the_frame_reports_its_battery_when_it_asks_how_long_to_sleep(tmp_path):
    client = TestClient(create_app(tmp_path))
    assert client.get("/api/battery").json() is None

    assert client.get("/api/sleep").status_code == 200  # an older frame doesn't send it
    assert client.get("/api/battery").json() is None

    assert int(client.get("/api/sleep", params={"battery": 3.954}).text) > 0
    battery = client.get("/api/battery").json()
    assert battery["voltage"] == 3.95
    assert battery["percent"] == 75
    assert battery["at"]

    client.get("/api/sleep", params={"battery": 0})  # no reading: keep the last one
    assert client.get("/api/battery").json()["voltage"] == 3.95

import asyncio

from peek import announce


def test_announce_starts_and_stops():
    async def run():
        announcer = announce.Announcer()
        await announcer.start()  # never raises, even without a network
        await announcer.stop()
        await announcer.stop()

    asyncio.run(run())


def test_port_follows_peek_port(monkeypatch):
    monkeypatch.setenv("PEEK_PORT", "8090")
    assert announce.port() == 8090

"""Announces Peek on the home network (mDNS), so frames find it by themselves.

Frames ask for "_peek._tcp" when they wake and get Peek's address back. This
only reaches the network when the container uses host networking (see
compose.yaml); elsewhere it does no harm, and frames fall back to an address
typed on their own page.
"""

from __future__ import annotations

import logging
import os
import socket

from zeroconf import IPVersion, ServiceInfo
from zeroconf.asyncio import AsyncZeroconf

SERVICE = "_peek._tcp.local."

log = logging.getLogger(__name__)


def port() -> int:
    return int(os.environ.get("PEEK_PORT", "8080"))


def local_ip() -> str | None:
    """This computer's address on the home network: the one its traffic to
    the internet leaves from. Nothing is actually sent."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("192.0.2.1", 9))  # a reserved address; only picks the route
            return s.getsockname()[0]
        except OSError:
            return None


class Announcer:
    def __init__(self) -> None:
        self._zeroconf: AsyncZeroconf | None = None
        self._info: ServiceInfo | None = None

    async def start(self) -> None:
        ip = local_ip()
        if ip is None or ip.startswith("127."):
            log.info("Not announcing Peek on the network: no network address found")
            return
        try:
            self._info = ServiceInfo(
                SERVICE,
                f"Peek.{SERVICE}",
                addresses=[socket.inet_aton(ip)],
                port=port(),
                server=f"peek-{socket.gethostname()}.local.",
            )
            self._zeroconf = AsyncZeroconf(ip_version=IPVersion.V4Only)
            await self._zeroconf.async_register_service(self._info, allow_name_change=True)
            log.info("Announcing Peek on the network at http://%s:%d", ip, port())
        except Exception:  # never stop Peek from starting over this
            log.warning("Couldn't announce Peek on the network", exc_info=True)
            await self.stop()

    async def stop(self) -> None:
        if self._zeroconf is not None:
            try:
                if self._info is not None:
                    await self._zeroconf.async_unregister_service(self._info)
                await self._zeroconf.async_close()
            except Exception:
                pass
        self._zeroconf = self._info = None

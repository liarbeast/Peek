"""Typefaces from Google Fonts, for text fields.

A font is downloaded the first time a page uses it and kept in the data
folder, so later renders work offline. Pages get it inlined as @font-face
rules with data URIs, so the renderer never fetches anything itself.
"""

from __future__ import annotations

import base64
import logging
import re
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Callable

log = logging.getLogger(__name__)

# Family -> the weights it comes in: the typefaces text fields can use.
FONTS = {
    "Poppins": (400, 700),
    "Ubuntu": (400, 700),
    "Mozilla Headline": (400, 700),
    "Alegreya": (400, 700),
    "IBM Plex Serif": (400, 700),
    "Permanent Marker": (400,),
    "Metamorphous": (400,),
    # Pixel faces, for sprites
    "Jacquard 12": (400,),
    "Press Start 2P": (400,),
    "Pixelify Sans": (400, 700),
}

# Only these character sets are kept: Latin covers English and the accents
# of most European languages.
_SUBSETS = ("latin", "latin-ext")
# Google sends woff2 to browsers it recognises.
_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": _AGENT})
    with urllib.request.urlopen(req, timeout=15) as res:
        return res.read()


class FontCache:
    def __init__(self, folder: Path, fetch: Callable[[str], bytes] = _get):
        self.folder = folder
        self.fetch = fetch

    def css(self, family: str) -> str:
        """@font-face rules for `family` with the font files inlined, or ""
        when it can't be had (the page then falls back to the default face)."""
        if family not in FONTS:
            return ""
        path = self.folder / (re.sub(r"[^a-z0-9]+", "-", family.lower()) + ".css")
        if path.exists():
            return path.read_text()
        try:
            css = self._download(family)
        except Exception as e:  # offline, or Google changed something
            log.warning("could not download font %s: %s", family, e)
            return ""
        self.folder.mkdir(parents=True, exist_ok=True)
        path.write_text(css)
        return css

    def _download(self, family: str) -> str:
        weights = ";".join(str(w) for w in FONTS[family])
        query = urllib.parse.urlencode({"family": f"{family}:wght@{weights}", "display": "block"})
        sheet = self.fetch(f"https://fonts.googleapis.com/css2?{query}").decode()
        rules = []
        # Each rule is preceded by a comment naming its character set.
        for subset, rule in re.findall(r"/\* ([\w-]+) \*/\s*(@font-face \{.*?\})", sheet, re.S):
            if subset not in _SUBSETS:
                continue
            url = re.search(r"url\((https://[^)]+)\)", rule).group(1)
            data = base64.b64encode(self.fetch(url)).decode()
            rules.append(rule.replace(url, f"data:font/woff2;base64,{data}"))
        if not rules:
            raise ValueError("no Latin font files in the stylesheet")
        return "\n".join(rules)

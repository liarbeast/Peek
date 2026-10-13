"""Fills a layout template with an item's fields to produce a page of HTML."""

from __future__ import annotations

import base64
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATES = ("photo", "quote", "sprite")

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html"]),
)


def data_uri(data: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def build(template: str, fields: dict, custom_css: str = "") -> str:
    if template not in TEMPLATES:
        raise ValueError(f"unknown template: {template}")
    return _env.get_template(f"{template}.html").render(**fields, custom_css=custom_css)

"""Fills the layout with an item's fields to produce a page of HTML.

The standard layout is Stack: every field in order, each element carrying
`field field-<key> type-<type>` classes so custom CSS can style, move or hide
any of them. A category can instead bring its own HTML, a template in which
`{{ title }}` places a field's value and `{{ images.frame }}` one of the
category's decoration images; Tailwind classes work there too.
"""

from __future__ import annotations

import base64
import secrets
from functools import cache
from pathlib import Path

from jinja2 import ChainableUndefined, Environment, FileSystemLoader, TemplateError, select_autoescape
from jinja2.sandbox import SandboxedEnvironment

TEMPLATES = ("stack",)

# What each layout offers, for the GUI. "fields" are the fields a new
# category starts with. Every layout also sets the six panel colours as
# --black, --white, --yellow, --red, --blue and --green, and the page is
# 800x480 or 480x800, so custom CSS can use @media (orientation: portrait).
TEMPLATE_INFO = {
    "stack": {
        "label": "Stack",
        "description": "Every field in order, top to bottom. Shape it any way you like with CSS.",
        "fields": [
            {"key": "image", "label": "Image", "type": "image"},
            {"key": "title", "label": "Title", "type": "text"},
            {"key": "subtext", "label": "Subtext", "type": "text"},
        ],
        "classes": [".stack"],
    },
}

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html"]),
)


def data_uri(data: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


# Decoration images are served to the renderer from this made-up origin
# (see renderer.render), which the page's security policy lets through.
IMAGE_ORIGIN = "https://peek.local"

TAILWIND = Path(__file__).parent / "static" / "vendor" / "tailwind-browser.js"

# Templates people write run sandboxed: they can show values, loop and branch,
# but can't reach anything in Peek's Python. Unknown names render as nothing,
# so `{{ subtitle }}` simply disappears for an item without one.
_user_env = SandboxedEnvironment(autoescape=True, undefined=ChainableUndefined)


class LayoutError(ValueError):
    """A category's own HTML can't be used; the message says why and where."""


def image_url(file: str) -> str:
    return f"{IMAGE_ORIGIN}/images/{file}"


def check_html(source: str) -> None:
    """Raise LayoutError if a category's own HTML isn't a valid template."""
    try:
        _user_env.parse(source)
    except TemplateError as e:
        raise LayoutError(_describe(e)) from e


def _describe(e: TemplateError) -> str:
    line = getattr(e, "lineno", None)
    return f"HTML line {line}: {e.message}" if line else f"HTML: {e.message}"


@cache
def _tailwind() -> str:
    return TAILWIND.read_text()


def build(template: str, fields: list[dict], values: dict, custom_css: str = "",
          size: tuple[int, int] = (800, 480), pixelate: bool = False,
          custom_html: str = "", images: dict[str, str] | None = None) -> str:
    """Render a layout.

    `values` maps field keys to what to show: text, or a data URI for images.
    `pixelate` draws images as pixel art: hard edges when enlarged, not dithered.
    `custom_html`, if given, replaces the layout's body. `images` maps the
    category's decoration image names to their URLs.
    """
    if template not in TEMPLATES:
        raise ValueError(f"unknown template: {template}")
    width, height = size
    images = images or {}
    page = {
        "custom_css": custom_css,
        "pixelate": pixelate,
        "width": width,
        "height": height,
        "images": images,
        "nonce": secrets.token_urlsafe(16),
        "image_origin": IMAGE_ORIGIN,
    }
    if custom_html.strip():
        try:
            body = _user_env.from_string(custom_html).render(
                {**{k: v or "" for k, v in values.items()}, "images": images, "fields": fields}
            )
        except TemplateError as e:
            raise LayoutError(_describe(e)) from e
        return _env.get_template("custom.html").render(body=body, tailwind=_tailwind(), **page)
    return _env.get_template(f"{template}.html").render(
        fields=[{**f, "value": values.get(f["key"]) or ""} for f in fields], **page
    )

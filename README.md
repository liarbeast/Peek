# Peek

Peek drives a battery-powered 7.3" Spectra 6 e-paper frame (800x480, six colours).
The frame wakes on a timer, downloads one image from Peek and goes back to sleep.
Peek decides what to show and renders it for the panel.

This is milestone 1: the renderer. It turns an HTML layout into a six-colour image,
dithering photos while keeping text crisp and pixel art blocky, and serves it to the frame.

## Run it

You need Docker (Docker Desktop or OrbStack on a Mac) or Podman (already on Fedora and Bazzite).

```sh
git clone https://github.com/liarbeast/peek.git
cd peek
docker compose up -d --build    # or: podman compose up -d --build
```

Open http://localhost:8080 for the preview page. The first build downloads Chromium and takes a few minutes.

Settings and the current image live in the `data` folder next to `compose.yaml`.
To move Peek to another machine, copy the whole folder and run the same command there.

## Endpoints the frame uses

| Endpoint | What it returns |
| --- | --- |
| `GET /api/sleep` | Seconds to sleep before the next wake, as plain text |
| `GET /frame.png` | The current 800x480 image, a paletted PNG in the six pure panel colours |

## Layouts and custom CSS

Layouts are Jinja templates in `server/peek/templates` (photo, quote, sprite), rendered at 800x480 in headless Chromium.
Custom CSS is added after the template's own styles, and can use the panel colours as
`var(--black)`, `var(--white)`, `var(--yellow)`, `var(--red)`, `var(--blue)` and `var(--green)`.

Images are treated as photos and dithered. Mark pixel art with `data-peek="pixel"` (and `image-rendering: pixelated`)
to map it to the nearest colours without dithering. Anything else can opt in to dithering with `data-peek="photo"`.

## Development

```sh
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt && playwright install chromium
cd server
pytest
uvicorn peek.app:app --reload --port 8080
```

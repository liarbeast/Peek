# Peek

Peek drives a battery-powered 7.3" Spectra 6 e-paper frame (800x480, six colours).
The frame wakes on a timer, downloads one image from Peek and goes back to sleep.
Peek decides what to show and renders it for the panel.

So far Peek has:

- **A renderer** that turns an HTML layout into a six-colour image, dithering photos while
  keeping text crisp and pixel art blocky.
- **A web app** to create categories (for example "Pokémon of the day" or "Movie quotes"),
  fill them with images and text, give each its own layout and custom CSS with a live preview,
  and pick what the frame shows.

## Run it

You need Docker (Docker Desktop or OrbStack on a Mac) or Podman (already on Fedora and Bazzite).

```sh
git clone https://github.com/liarbeast/peek.git
cd peek
docker compose up -d --build    # or: podman compose up -d --build
```

Open http://localhost:8080. The first build downloads Chromium and takes a few minutes.
The renderer's test page with built-in samples is at http://localhost:8080/samples.

Categories, uploaded images and the current frame image live in the `data` folder next to `compose.yaml`.
To move Peek to another machine, copy the whole folder and run the same command there.

## Endpoints the frame uses

| Endpoint | What it returns |
| --- | --- |
| `GET /api/sleep` | Seconds to sleep before the next wake, as plain text |
| `GET /frame.png` | The current 800x480 image, a paletted PNG in the six pure panel colours |

## Layouts and custom CSS

Layouts are Jinja templates in `server/peek/templates` (photo, quote, sprite), rendered in headless Chromium at 800x480, or at 480x800 when Settings says the frame hangs in portrait. The panel always gets 800x480, turned to match. Custom CSS can target portrait with `@media (orientation: portrait)`.
Custom CSS is added after the template's own styles, and can use the panel colours as
`var(--black)`, `var(--white)`, `var(--yellow)`, `var(--red)`, `var(--blue)` and `var(--green)`.

Images are treated as photos and dithered. Mark pixel art with `data-peek="pixel"` (and `image-rendering: pixelated`)
to map it to the nearest colours without dithering. Anything else can opt in to dithering with `data-peek="photo"`.

## Development

The server is Python (FastAPI, SQLite, Playwright); the web app in `web/` is React with HeroUI, built with Vite.

```sh
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt && playwright install chromium
cd server
pytest
uvicorn --factory peek.app:main --reload --port 8080
```

In a second terminal, run the web app with live reload on http://localhost:5173 (it forwards API calls to port 8080):

```sh
cd web
npm install
npm run dev
```

`npm run build` writes the finished app to `server/peek/static/app`, where the server picks it up.

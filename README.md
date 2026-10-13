# Peek

Peek drives a battery-powered 7.3" Spectra 6 e-paper frame (800x480, six colours).
The frame wakes on a timer, downloads one image from Peek and goes back to sleep.
Peek decides what to show and renders it for the panel.

So far Peek has:

- **A renderer** that turns a page of fields into a six-colour image, dithering photos while
  keeping text crisp and pixel art blocky.
- **A web app** to create categories (for example "Pokémon of the day" or "Movie quotes"),
  give each its own fields, fill them by hand or from a CSV, style them with custom CSS and a live
  preview, and pick what the frame shows.

## Run it

You need Docker (Docker Desktop or OrbStack on a Mac) or Podman (already on Fedora and Bazzite).

```sh
git clone https://github.com/liarbeast/peek.git
cd peek
docker compose up -d --build    # or: podman compose up -d --build
```

Open http://localhost:8080. The first build downloads Chromium and takes a few minutes.

Categories, uploaded images and the current frame image live in the `data` folder next to `compose.yaml`.
To move Peek to another machine, copy the whole folder and run the same command there.

## Endpoints the frame uses

| Endpoint | What it returns |
| --- | --- |
| `GET /api/sleep` | Seconds to sleep before the next wake, as plain text |
| `GET /frame.png` | The current 800x480 image, a paletted PNG in the six pure panel colours |

## Fields and CSV import

Each category has its own fields, each holding text or an image, edited on its Fields tab.
Items store one value per field. A CSV file can fill a category: each row becomes an item, columns are matched to
fields by name or added as new fields, and image columns hold URLs that Peek downloads. Comma, semicolon and tab
separated files all work.

## Styling with CSS

Every item is drawn by one layout, Stack (`server/peek/templates/stack.html`): each field in order, centred, inside
`.stack`. Every field's element has the classes `field field-<key> type-<type>`, so a category's custom CSS can style,
move or hide any field; the layout's own rules never outweigh it. A category can also be drawn in black and white only.

Pages are rendered in headless Chromium at 800x480, or at 480x800 when Settings says the frame hangs in portrait; the
panel always gets 800x480, turned to match. CSS can target portrait with `@media (orientation: portrait)` and use the
panel colours as `var(--black)`, `var(--white)`, `var(--yellow)`, `var(--red)`, `var(--blue)` and `var(--green)`.

Images are treated as photos and dithered. An image drawn with `image-rendering: pixelated` counts as pixel art: it is
mapped to the nearest colours without dithering, so it stays sharp.

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

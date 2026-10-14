# Peek

Peek drives a battery-powered 7.3" Spectra 6 e-paper frame (800x480, six colours).
The frame wakes on a timer, downloads one image from Peek and goes back to sleep.
Peek decides what to show and renders it for the panel.

So far Peek has:

- **A renderer** that turns a page of fields into a six-colour image, dithering photos while
  keeping text crisp and pixel art blocky.
- **A web app** to create categories (for example "Pokémon of the day" or "Movie quotes"),
  give each its own fields, fill them by hand or from a CSV, lay them out by dragging on a live
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

## Styling

Every item is drawn by one layout, Canvas (`server/peek/templates/canvas.html`): each field sits in a box of its own,
which you place by dragging it in the Style tab's preview. Until a field is moved, it sits in its default box: fields
one under the other, full width and centred, each attached below the one before.

- **Moving:** drag a box. It snaps to the canvas centre and edges and to other fields (hold Alt to stop snapping), and
  the arrow keys nudge it.
- **Size:** a text box has one handle, for its width: the text wraps inside it and the box is as tall as its lines. Its
  text size is set in pixels. Images scale from their corner and keep their shape.
- **Style:** click a field for its toolbar: alignment, text size, bold, colour (the panel's six), typeface, front and
  back, and Attach. A field attached below another is drawn the same distance under it, so when a title wraps to two
  lines, the subtitle attached below it moves down with it. An empty field takes no room.
- **Typefaces** come from Google Fonts (the list is in `server/peek/fonts.py`). Each is downloaded the first time a page
  uses it and kept in the data folder, so the frame keeps working offline.
- **Style images** are uploaded per category and drawn the same for every item, such as a frame around a sprite. They
  start out covering the whole page behind the fields, and are dragged and resized like fields. Each is drawn either
  crisp (solid colours, for graphics) or as a photo (dithered).

Boxes are kept per orientation: pages are rendered in headless Chromium at 800x480, or at 480x800 when Settings says
the frame hangs in portrait, and the panel always gets 800x480, turned to match.

The Style tab also has two filters. Black and white draws the category in black and white only, turning shades into
dither patterns (an even, regular one for crisp images). Crisp images resizes images without smoothing and maps each pixel
to the nearest panel colour instead of dithering it like a photo: for pixel art, icons, logos and QR codes.
(Under the hood, any image drawn with `image-rendering: pixelated` is treated this way.)

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

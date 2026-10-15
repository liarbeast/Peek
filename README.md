# Peek

Peek drives a battery-powered 7.3" Spectra 6 e-paper frame (800x480, six colours).
The frame wakes on a timer, downloads one image from Peek and goes back to sleep.
Peek decides what to show and renders it for the panel.

So far Peek has:

- **A renderer** that turns a page of fields into a six-colour image, dithering photos while
  keeping text crisp and pixel art blocky.
- **A web app** to create collections (for example "Pokémon of the day" or "Movie quotes"),
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
Peek keeps time in the zone set as `TZ` in `compose.yaml` (`Europe/Amsterdam`); change it to yours, so "at midnight"
and "today" mean your midnight.

Collections, uploaded images and the current frame image live in the `data` folder next to `compose.yaml`.
To move Peek to another machine, copy the whole folder and run the same command there.

## See changes without rebuilding

`compose.dev.yaml` runs Peek straight from this folder instead of from a built image. The server restarts by itself
when its code changes, and the web app updates in the open page, so after pulling new code there is nothing to rebuild:

```sh
docker compose down                         # stop the normal Peek first (it uses the same port)
docker compose -f compose.dev.yaml up -d    # or: podman compose -f compose.dev.yaml up -d
git pull                                    # whenever there are changes; they show up within seconds
```

Open http://localhost:5173 (the frame keeps using port 8080). The first start installs the web app's packages, which
takes a minute. Add `--build` only when `requirements.txt` changes, and go back with
`docker compose -f compose.dev.yaml down && docker compose up -d --build`.

## Endpoints the frame uses

| Endpoint | What it returns |
| --- | --- |
| `GET /api/sleep` | Seconds to sleep before the next wake, as plain text: until the next refresh set in Settings (every 15 minutes up to weekly), on the round time in the server's time zone |
| `GET /frame.png` | The current 800x480 image, a paletted PNG in the six pure panel colours. Once per refresh it moves on to the next item of the current collection (in the collection's item order), and once per "Switch collection" interval to the next active collection. "Show" on an item puts it on the frame until the next refresh |

## Fields and CSV import

Each collection has its own fields, each holding text or an image, edited on its Fields tab.
Items store one value per field. A CSV file can fill a collection: each row becomes an item, columns are matched to
fields by name or added as new fields, and image columns hold URLs that Peek downloads. Comma, semicolon and tab
separated files all work.

## Data sources

A collection can fill itself from a web address that returns JSON: "Connect data source" on its Items tab. The address
may hold placeholders, filled in on every fetch: `{YYYY}`, `{MM}` and `{DD}` for today's date, and
`{RANDOM:min-max}` for a random whole number in that range (for an API that has no "random" address of its own). A source is read again on every wake
that shows its collection, so Refresh in Settings decides how fresh it is. Entries it already had keep their item,
with their place in the rotation and their downloaded images; new ones are added and gone ones removed. "Look at response" fetches it, finds the lists of entries in it,
and lists every value in an entry with an example, like the columns of a CSV. Each value you use becomes a new field
(or fills an existing one); fields you don't use are removed, since they'd stay empty. Values are stored as dotted
paths (`selected`, `pages.0.thumbnail.source`). While a source is connected, its items can't be edited by hand. Image
addresses are downloaded. If the address can't be read, the old items stay.

For example, Wikipedia's "On this day":
`https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/{MM}/{DD}`, list `selected`, with `year`, `text` and
`pages.0.thumbnail.source`.

## Styling

Every item is drawn by one layout, Canvas (`server/peek/templates/canvas.html`): each field sits in a box of its own,
which you place by dragging it in the Style tab's preview. Until a field is moved, it sits in its default box: fields
one under the other, full width and centred, each attached below the one before.

- **Moving:** drag a box. It snaps to the canvas centre and edges and to other fields (hold Alt to stop snapping), and
  the arrow keys nudge it. Shift-click picks several fields, which then drag and nudge together.
- **Size:** a text box has one handle, for its width: the text wraps inside it and the box is as tall as its lines.
  "Grow" in its toolbar picks which edge stays put when the text takes more or fewer lines: the top (down, the
  default), the bottom (up) or the centre (middle). Fields attached below still follow its real bottom edge. Its
  text size is set in pixels. Images scale from their corner and keep their shape.
- **Style:** click a field for its toolbar: alignment, text size, colour (the panel's six), typeface, weight, front and
  back, and "Attach to". A field attached to another keeps its distance from where that one ends, so when a title wraps to two
  lines, the subtitle attached below it moves down with it. An empty field takes no room.
- **Typefaces** come from Google Fonts (the list is in `server/peek/fonts.py`). Each is downloaded the first time a page
  uses it (only the weights in use) and kept in the data folder, so the frame keeps working offline. The weight
  menu lists only the weights each typeface really has.
- **Style images** are uploaded per collection and drawn the same for every item, such as a frame around a sprite. They
  start out covering the whole page behind the fields, and are dragged and resized like fields. Each is drawn either
  crisp (solid colours, for graphics) or as a photo (dithered).

Boxes are kept per orientation: pages are rendered in headless Chromium at 800x480, or at 480x800 when Settings says
the frame hangs in portrait, and the panel always gets 800x480, turned to match.

The Style tab also has two filters. Black and white draws the collection in black and white only, turning shades into
dither patterns (an even, regular one for crisp images). Crisp images resizes images without smoothing and maps each pixel
to one panel colour instead of dithering it like a photo: for pixel art, icons, logos and QR codes. Colours are matched
mostly by hue, because the panel's green and red are dark: a bright sprite green becomes the panel's green, not its yellow.
Text and shapes are mapped the same way.
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

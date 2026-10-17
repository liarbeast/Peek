# Why a mapped image doesn't show up

Research for: "the source has images, but when you map them to the image field it doesn't work".

## How it works today

When a data source (or a CSV import) fills an **Image** field, Peek doesn't store the address. It
downloads the picture once and keeps the file (`content.sync_source` and `content.import_csv`, both via
`csv_import.download_images`). A download is accepted only when all of this holds:

1. The value is a full `http(s)://` address, with nothing before it (`_URL`, `csv_import.py:17`).
2. The server answers 200 to a request with Peek's own User-Agent and no Referer.
3. The answer's `Content-Type` is exactly `image/png`, `image/jpeg`, `image/gif` or `image/webp`
   (`IMAGE_TYPES`, `content.py:26`).
4. The file is at most 15 MB.

If any of these fails, the field is silently left empty.

## Reproduced

`download_images` was tested against a local server with the same PNG served in different ways:

| What the source gives | Result |
| --- | --- |
| `https://…/bird.png` sent as `image/png` | OK |
| Sent as `image/jpg` (a common misspelling of `image/jpeg`) | dropped |
| Sent as `application/octet-stream` or `binary/octet-stream` (typical of S3 and many CDNs) | dropped |
| Sent with no `Content-Type` | dropped |
| AVIF or SVG | dropped |
| A server that refuses non-browser clients (hotlink protection, 403) | dropped |
| A relative address (`/media/bird.jpg`) or one without a scheme (`//cdn…/bird.jpg`) | dropped |
| A full address with a leading space | dropped |

So a source can visibly "have images" (they open fine in a browser) and still produce none in Peek.
Browsers sniff the bytes and ignore a wrong `Content-Type`, send a browser User-Agent and Referer, and resolve
relative addresses against the page. Peek does none of these.

## Two things make it worse

- **No feedback for data sources.** CSV import reports "N images could not be downloaded". Connecting a source,
  "Fetch now" and the wake fetch report nothing, so the field just looks broken.
- **A failed picture is never retried.** An entry is remembered by its values, including the image address
  (`SOURCE_ENTRY`). On the next fetch the entry matches, the item is kept as is, and the download isn't tried
  again. A temporary failure (timeout, rate limit) stays permanent until the source changes that entry.

## Proposed fixes (general, not per source)

1. **Decide by the bytes, not the header.** Read the file and let Pillow say what it is; accept anything Pillow
   opens (PNG, JPEG, GIF, WebP, plus BMP/TIFF, and AVIF with the plugin), and store it under the extension
   for its real format. This alone fixes the `image/jpg`, octet-stream and missing-header cases. Small and
   self-contained; this is the one I'd do first.
2. **Resolve and tidy addresses.** Strip whitespace; resolve relative and `//` addresses against the source
   address (`urljoin`). CSV imports have no base, so they keep requiring full addresses.
3. **Retry what failed.** Leave the image address in the item (for example under `_entry`) and on each fetch
   retry entries whose image is still missing, with a cap so a dead link isn't fetched on every wake forever.
4. **Say what went wrong.** Return the count of failed pictures from connect and "Fetch now", and show it like
   CSV import does, with the first reason (for example "the server refused" or "not an image").
5. **Friendlier requests (optional).** Send an `Accept: image/*` header and the source's own origin as Referer.
   That gets past most hotlink protection without pretending to be a browser.

SVG stays out of scope: the renderer works with bitmaps, and turning SVG into one needs an extra library.

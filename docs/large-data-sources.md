# Large data sources

Research note: what happens when a collection is connected to a data source
with a very large number of entries (around 11,000), where it breaks, and what
to change. Nothing here is built yet.

## How a source works today

- **Fetch.** `sources.fetch` loads one address and reads one list out of the
  JSON (`server/peek/sources.py`). There is no paging: if an API returns its
  entries in pages, Peek only ever sees the first page.
- **When.** Every wake that shows the collection calls `sync_source`
  (`server/peek/content.py`) from inside `GET /frame.png`, so the frame waits,
  awake on Wi-Fi, while the server fetches. Connecting a source and "fetch now"
  also sync inside the web request.
- **Merge.** Each entry is identified by the JSON of its mapped values
  (`_entry`). Unchanged entries keep their item, picture and place in the
  rotation; new ones are added, missing ones deleted.
- **Pictures.** Every new entry's image URLs are downloaded during the sync
  (8 at a time, up to 15 MB each) and stored at full size.
- **Items page.** `GET /api/categories/{id}/items` returns every item, and the
  Items tab draws one row and one full-size `<img>` per item.

## What 11,000 entries does

Measured on the server code with a fake source of 11,000 two-field text
entries (no network, no pictures):

| Step | Time |
| --- | --- |
| First sync (insert 11,000 items) | 1.7 s |
| Re-sync, nothing changed | 0.16 s |
| A wake: pick next item, including the re-sync | 0.4 s |
| Load all items for the Items tab | 0.07 s, 6.9 MB of JSON |
| Database size | 6.6 MB |

So **SQLite, the merge and the rotation logic are fine at this size.** The
problems are elsewhere:

1. **Pictures.** Connecting the source downloads 11,000 images in one go. At a
   few hundred KB each that is gigabytes of disk and many minutes of
   downloading, all inside the "Connect" request, which the browser or a
   reverse proxy will likely give up on. The same happens on a wake whenever
   many entries are new.
2. **The frame waits for the sync.** The frame's download times out after 20 s
   (`http_request.timeout` in `firmware/peek-frame.yaml`). Any sync slower than
   that (a big response, a slow API, new pictures) makes the wake fail; the
   frame shows nothing new and retries in 15 minutes, having spent its Wi-Fi
   time for nothing. Peek recovers on the retry, but it costs battery.
3. **Paged APIs.** Most APIs with thousands of entries hand them out in pages
   of 20 to 100. Today the collection silently ends up with just the first page.
4. **Unstable entries.** If an entry holds a value that changes between
   fetches (a view count, an "updated" time), it no longer matches its item, so
   every entry looks new on every wake: all items are replaced, every picture
   is downloaded again and the rotation restarts at the first entry.
5. **Items page.** 6.9 MB of JSON, 11,000 rows and 11,000 full-size images in
   one page is slow on a phone. (Pagination and filtering are being added
   separately.)
6. **Rotation.** "In order" and "Shuffle" work at any size. "Once a collection
   is finished" means a lap of 11,000 wakes: at an hourly refresh that is about
   15 months before the frame moves to another collection.
7. **Re-downloading the whole list on every wake.** Cheap for the database, but
   a multi-megabyte response every 15 minutes is wasteful for the server and
   unkind to the API.

## Options

### A. Download pictures when they're needed (recommended)

Store the image URL on the item instead of the picture. Download it when the
item is about to be shown (and keep a small cache, e.g. the last few hundred
pictures, deleting the oldest). The Items tab shows a small thumbnail made on
demand by the server and cached.

- Connecting a source of any size only stores text: seconds, not minutes.
- Disk use stays bounded no matter how big the source is.
- A wake downloads at most one picture.
- Unstable entries no longer cost a mass re-download.

Manual items and CSV imports can keep downloading at once, as today.

### B. Sync in the background, not while the frame waits (recommended)

On a wake, answer the frame straight away with the next item from what is
already stored, then sync the source in the background so the next wake sees
fresh entries. Connect and "fetch now" start the same background job and the
Items tab shows its progress. This keeps the rule that sources follow
Refresh; the only difference is that the frame never waits on the network.

For sources whose value is "what's true right now" (weather, a single random
entry) the result would be one refresh old. To keep those live, sync in the
foreground only when the response is a single entry or small, with a time
limit well under the frame's 20 s, falling back to the stored item.

### C. Follow pages

Detect common paging styles in the response when the source is set up (a
`next` link, or `page`/`offset`/`cursor` parameters with a total) and keep
fetching pages during the background sync. Put a ceiling on it (say 20,000
entries, in line with CSV's 5,000 row limit) and tell the user when a source
was cut off, instead of failing silently.

### D. Identify entries by a stable value

When the user maps the source, pick an id-like value (`id`, `slug`, `url`, or
the first unique value across the list) as the entry's identity, with the
other values updated in place. Fall back to today's "all values" identity when
nothing unique exists. This keeps the rotation position and pictures when an
entry's details change.

### E. Cheaper re-fetches

Send `If-None-Match` / `If-Modified-Since` with the stored ETag or date, and
skip the merge when the server answers 304 or the response is byte-for-byte the
same as last time (store a hash). No setting needed.

### F. Items page and rotation

- Paged, searchable items list (separate work), plus `loading="lazy"` and
  thumbnails instead of full-size images.
- For "Once a collection is finished", show how long a lap takes ("about 15
  months at this refresh") next to the setting, so a large collection's effect
  isn't a surprise.

## Recommendation

Do **A** and **B** first: they remove the failures (timeouts, gigabytes of
pictures, a stuck Connect dialog) and make wake cost independent of source
size. Then **C**, since without it most large sources only give their first
page. **D** and **E** are small follow-ups that make large sources cheaper to
keep in sync. The database needs no changes for this size.

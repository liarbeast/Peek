"""SQLite storage for categories, their items and the frame's settings.

The database is one file in the data folder; uploaded images sit next to it
in ``images/``. Every call opens its own short-lived connection, which keeps
things simple and safe across FastAPI's worker threads.
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

ITEM_ORDERS = ("in_order", "random", "shuffle")

# Each entry upgrades the schema by one version; never edit a shipped entry.
MIGRATIONS = [
    """
    CREATE TABLE category (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        template TEXT NOT NULL,
        custom_css TEXT NOT NULL DEFAULT '',
        item_order TEXT NOT NULL DEFAULT 'in_order',
        weight INTEGER NOT NULL DEFAULT 1,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE item (
        id INTEGER PRIMARY KEY,
        category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        subtitle TEXT NOT NULL DEFAULT '',
        text TEXT NOT NULL DEFAULT '',
        image TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        times_shown INTEGER NOT NULL DEFAULT 0,
        last_shown TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX item_category ON item(category_id, position);
    """,
    """
    CREATE TABLE setting (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """,
    # Per-category fields: items keep their values as JSON in item.data, and
    # each category lists its fields (and, until migration 4, layout places).
    """
    ALTER TABLE category ADD COLUMN fields TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE category ADD COLUMN slots TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE category ADD COLUMN mono INTEGER NOT NULL DEFAULT 0;
    UPDATE category SET fields = CASE template
        WHEN 'photo' THEN '[{"key":"image","label":"Image","type":"image"},{"key":"title","label":"Title","type":"text"}]'
        WHEN 'quote' THEN '[{"key":"text","label":"Text","type":"long_text"},{"key":"title","label":"Title","type":"text"}]'
        ELSE '[{"key":"image","label":"Image","type":"image"},{"key":"title","label":"Title","type":"text"},{"key":"subtitle","label":"Subtitle","type":"text"},{"key":"text","label":"Text","type":"long_text"}]'
    END;
    ALTER TABLE item ADD COLUMN data TEXT NOT NULL DEFAULT '{}';
    UPDATE item SET data = json_patch('{}', json_object(
        'image', image, 'title', NULLIF(title, ''), 'subtitle', NULLIF(subtitle, ''), 'text', NULLIF(text, '')
    ));
    ALTER TABLE item DROP COLUMN title;
    ALTER TABLE item DROP COLUMN subtitle;
    ALTER TABLE item DROP COLUMN text;
    ALTER TABLE item DROP COLUMN image;
    """,
    # One layout (Stack) instead of several, so no more layout places; and
    # fields are only text or image, so long text, numbers, dates and links
    # all become text.
    """
    UPDATE category SET template = 'stack';
    ALTER TABLE category DROP COLUMN slots;
    UPDATE category SET fields = (
        SELECT json_group_array(json_set(f.value, '$.type',
            CASE json_extract(f.value, '$.type') WHEN 'image' THEN 'image' ELSE 'text' END))
        FROM json_each(category.fields) AS f
    );
    """,
    # A Pixelate filter for pixel art, switched on where custom CSS already
    # drew images pixelated.
    """
    ALTER TABLE category ADD COLUMN pixelate INTEGER NOT NULL DEFAULT 0;
    UPDATE category SET pixelate = 1 WHERE custom_css LIKE '%pixelated%';
    """,
    # Version 6 was a trial (own HTML and decoration images) that never
    # shipped; databases that ran it are left as they are, and this keeps the
    # numbering in step for everyone else.
    "SELECT 1;",
    # Where fields are dragged to, per orientation:
    # {"landscape": {"title": {"x": 40, "y": 20, "w": 300, "h": 60}}}.
    """
    ALTER TABLE category ADD COLUMN positions TEXT NOT NULL DEFAULT '{}';
    """,
]

# Frame-wide settings and their values until someone changes them.
SETTING_DEFAULTS = {
    "orientation": "landscape",
}


class Store:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.images = data_dir / "images"
        self.path = data_dir / "peek.db"

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def migrate(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.images.mkdir(exist_ok=True)
        with self.connect() as conn:
            version = conn.execute("PRAGMA user_version").fetchone()[0]
            for i, script in enumerate(MIGRATIONS[version:], start=version + 1):
                conn.executescript(script)
                conn.execute(f"PRAGMA user_version = {i}")

    # Settings

    def settings(self) -> dict:
        with self.connect() as conn:
            rows = conn.execute("SELECT key, value FROM setting").fetchall()
        return {**SETTING_DEFAULTS, **{k: v for k, v in rows if k in SETTING_DEFAULTS}}

    def update_settings(self, fields: dict) -> dict:
        with self.connect() as conn:
            conn.executemany(
                "INSERT INTO setting (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [(k, str(v)) for k, v in fields.items() if k in SETTING_DEFAULTS],
            )
        return self.settings()

    # Categories

    def categories(self) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                """SELECT c.*, COUNT(i.id) AS item_count
                   FROM category c LEFT JOIN item i ON i.category_id = c.id
                   GROUP BY c.id ORDER BY c.name COLLATE NOCASE"""
            ).fetchall()
            categories = [_category(r) for r in rows]
            for c in categories:
                c["cover"] = self._cover(conn, c)
        return categories

    def _cover(self, conn: sqlite3.Connection, category: dict) -> str | None:
        """The first image of the category's first image field, if any."""
        key = next((f["key"] for f in category["fields"] if f["type"] == "image"), None)
        if key is None:
            return None
        row = conn.execute(
            """SELECT json_extract(data, ?) FROM item
               WHERE category_id = ? AND json_extract(data, ?) IS NOT NULL
               ORDER BY position LIMIT 1""",
            (f'$."{key}"', category["id"], f'$."{key}"'),
        ).fetchone()
        return row[0] if row else None

    def category(self, category_id: int) -> dict | None:
        with self.connect() as conn:
            row = conn.execute(
                """SELECT c.*, (SELECT COUNT(*) FROM item WHERE category_id = c.id) AS item_count
                   FROM category c WHERE c.id = ?""",
                (category_id,),
            ).fetchone()
        if not row:
            return None
        category = _category(row)
        category["cover"] = None
        return category

    def create_category(self, fields: dict) -> dict:
        with self.connect() as conn:
            cur = conn.execute(
                """INSERT INTO category (name, template, custom_css, item_order, weight, enabled, fields, mono, pixelate,
                                         positions)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    fields["name"],
                    fields["template"],
                    fields.get("custom_css", ""),
                    fields.get("item_order", "in_order"),
                    fields.get("weight", 1),
                    int(fields.get("enabled", True)),
                    json.dumps(fields.get("fields", [])),
                    int(fields.get("mono", False)),
                    int(fields.get("pixelate", False)),
                    json.dumps(fields.get("positions", {})),
                ),
            )
            new_id = cur.lastrowid
        return self.category(new_id)

    def update_category(self, category_id: int, fields: dict) -> dict | None:
        allowed = ("name", "template", "custom_css", "item_order", "weight", "enabled", "fields", "mono", "pixelate",
                   "positions")
        changes = {k: _column(k, v) for k, v in fields.items() if k in allowed}
        if changes:
            sets = ", ".join(f"{k} = ?" for k in changes)
            with self.connect() as conn:
                conn.execute(f"UPDATE category SET {sets} WHERE id = ?", (*changes.values(), category_id))
        return self.category(category_id)

    def delete_category(self, category_id: int) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM category WHERE id = ?", (category_id,))

    # Items

    def items(self, category_id: int) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM item WHERE category_id = ? ORDER BY position, id", (category_id,)
            ).fetchall()
        return [_item(r) for r in rows]

    def item(self, item_id: int) -> dict | None:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM item WHERE id = ?", (item_id,)).fetchone()
        return _item(row) if row else None

    def create_items(self, category_id: int, datas: list[dict]) -> list[dict]:
        """Add items at the end of the category, in one transaction."""
        ids = []
        with self.connect() as conn:
            position = conn.execute(
                "SELECT COALESCE(MAX(position), 0) FROM item WHERE category_id = ?", (category_id,)
            ).fetchone()[0]
            for data in datas:
                position += 1
                cur = conn.execute(
                    "INSERT INTO item (category_id, position, data) VALUES (?, ?, ?)",
                    (category_id, position, json.dumps(data)),
                )
                ids.append(cur.lastrowid)
        return [self.item(i) for i in ids]

    def create_item(self, category_id: int, data: dict) -> dict:
        return self.create_items(category_id, [data])[0]

    def update_item(self, item_id: int, fields: dict) -> dict | None:
        allowed = ("data", "enabled", "position")
        changes = {k: _column(k, v) for k, v in fields.items() if k in allowed}
        if changes:
            sets = ", ".join(f"{k} = ?" for k in changes)
            with self.connect() as conn:
                conn.execute(f"UPDATE item SET {sets} WHERE id = ?", (*changes.values(), item_id))
        return self.item(item_id)

    def delete_item(self, item_id: int) -> None:
        with self.connect() as conn:
            conn.execute("DELETE FROM item WHERE id = ?", (item_id,))

    def reorder_items(self, category_id: int, item_ids: list[int]) -> None:
        with self.connect() as conn:
            for position, item_id in enumerate(item_ids, start=1):
                conn.execute(
                    "UPDATE item SET position = ? WHERE id = ? AND category_id = ?",
                    (position, item_id, category_id),
                )


def _column(key: str, value):
    """A value as SQLite stores it: JSON for structures, 0/1 for flags."""
    if key in ("fields", "data", "positions"):
        return json.dumps(value)
    if key in ("enabled", "mono", "pixelate"):
        return int(value)
    return value


def _category(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["enabled"] = bool(d["enabled"])
    d["mono"] = bool(d["mono"])
    d["pixelate"] = bool(d["pixelate"])
    d["fields"] = json.loads(d["fields"])
    d["positions"] = json.loads(d["positions"])
    return d


def _item(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["enabled"] = bool(d["enabled"])
    d["data"] = json.loads(d["data"])
    return d

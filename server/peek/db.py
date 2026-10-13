"""SQLite storage for categories and their items.

The database is one file in the data folder; uploaded images sit next to it
in ``images/``. Every call opens its own short-lived connection, which keeps
things simple and safe across FastAPI's worker threads.
"""

from __future__ import annotations

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
                """SELECT c.*, COUNT(i.id) AS item_count,
                          (SELECT image FROM item WHERE category_id = c.id AND image IS NOT NULL
                           ORDER BY position LIMIT 1) AS cover
                   FROM category c LEFT JOIN item i ON i.category_id = c.id
                   GROUP BY c.id ORDER BY c.name COLLATE NOCASE"""
            ).fetchall()
        return [_category(r) for r in rows]

    def category(self, category_id: int) -> dict | None:
        with self.connect() as conn:
            row = conn.execute(
                """SELECT c.*, (SELECT COUNT(*) FROM item WHERE category_id = c.id) AS item_count,
                          NULL AS cover
                   FROM category c WHERE c.id = ?""",
                (category_id,),
            ).fetchone()
        return _category(row) if row else None

    def create_category(self, fields: dict) -> dict:
        with self.connect() as conn:
            cur = conn.execute(
                "INSERT INTO category (name, template, custom_css, item_order, weight, enabled) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    fields["name"],
                    fields["template"],
                    fields.get("custom_css", ""),
                    fields.get("item_order", "in_order"),
                    fields.get("weight", 1),
                    int(fields.get("enabled", True)),
                ),
            )
            new_id = cur.lastrowid
        return self.category(new_id)

    def update_category(self, category_id: int, fields: dict) -> dict | None:
        allowed = ("name", "template", "custom_css", "item_order", "weight", "enabled")
        changes = {k: (int(v) if k == "enabled" else v) for k, v in fields.items() if k in allowed}
        if changes:
            sets = ", ".join(f"{k} = ?" for k in changes)
            with self.connect() as conn:
                conn.execute(f"UPDATE category SET {sets} WHERE id = ?", (*changes.values(), category_id))
        return self.category(category_id)

    def delete_category(self, category_id: int) -> list[str]:
        """Delete a category and its items; returns image files to remove."""
        with self.connect() as conn:
            images = [r[0] for r in conn.execute(
                "SELECT image FROM item WHERE category_id = ? AND image IS NOT NULL", (category_id,)
            )]
            conn.execute("DELETE FROM category WHERE id = ?", (category_id,))
        return images

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

    def create_item(self, category_id: int, fields: dict) -> dict:
        with self.connect() as conn:
            position = conn.execute(
                "SELECT COALESCE(MAX(position), 0) + 1 FROM item WHERE category_id = ?", (category_id,)
            ).fetchone()[0]
            cur = conn.execute(
                "INSERT INTO item (category_id, position, title, subtitle, text, image) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    category_id,
                    position,
                    fields.get("title", ""),
                    fields.get("subtitle", ""),
                    fields.get("text", ""),
                    fields.get("image"),
                ),
            )
            new_id = cur.lastrowid
        return self.item(new_id)

    def update_item(self, item_id: int, fields: dict) -> dict | None:
        allowed = ("title", "subtitle", "text", "image", "enabled", "position")
        changes = {k: (int(v) if k == "enabled" else v) for k, v in fields.items() if k in allowed}
        if changes:
            sets = ", ".join(f"{k} = ?" for k in changes)
            with self.connect() as conn:
                conn.execute(f"UPDATE item SET {sets} WHERE id = ?", (*changes.values(), item_id))
        return self.item(item_id)

    def delete_item(self, item_id: int) -> str | None:
        """Delete an item; returns its image file to remove, if any."""
        with self.connect() as conn:
            row = conn.execute("SELECT image FROM item WHERE id = ?", (item_id,)).fetchone()
            conn.execute("DELETE FROM item WHERE id = ?", (item_id,))
        return row[0] if row else None

    def reorder_items(self, category_id: int, item_ids: list[int]) -> None:
        with self.connect() as conn:
            for position, item_id in enumerate(item_ids, start=1):
                conn.execute(
                    "UPDATE item SET position = ? WHERE id = ? AND category_id = ?",
                    (position, item_id, category_id),
                )


def _category(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["enabled"] = bool(d["enabled"])
    return d


def _item(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["enabled"] = bool(d["enabled"])
    return d

import sqlite3

from peek import db


def test_items_move_to_fields(tmp_path):
    # A database as the previous version left it: fixed item columns.
    conn = sqlite3.connect(tmp_path / "peek.db")
    for script in db.MIGRATIONS[:2]:
        conn.executescript(script)
    conn.execute("PRAGMA user_version = 2")
    conn.execute("INSERT INTO category (id, name, template) VALUES (1, 'Quotes', 'quote'), (2, 'Mons', 'sprite')")
    conn.execute(
        "INSERT INTO item (category_id, position, title, subtitle, text, image) VALUES "
        "(1, 1, 'Casablanca', '', 'Here''s looking at you, kid.', NULL), "
        "(2, 1, 'pikachu', '#025', '', 'abc.png')"
    )
    conn.commit()
    conn.close()

    store = db.Store(tmp_path)
    store.migrate()
    quotes, mons = store.categories()[1], store.categories()[0]
    assert [f["key"] for f in quotes["fields"]] == ["text", "title"]
    assert [f["key"] for f in mons["fields"]] == ["image", "title", "subtitle", "text"]
    assert store.items(1)[0]["data"] == {"title": "Casablanca", "text": "Here's looking at you, kid."}
    assert store.items(2)[0]["data"] == {"image": "abc.png", "title": "pikachu", "subtitle": "#025"}
    assert mons["cover"] == "abc.png"

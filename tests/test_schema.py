import sqlite3
from src.db.schema import init_db


def test_init_db_creates_all_tables(tmp_db):
    init_db(tmp_db)
    conn = sqlite3.connect(tmp_db)
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = {row[0] for row in cursor.fetchall()}
    conn.close()
    assert tables == {"semaines", "tickets", "analyses", "decisions", "dictionnaire", "exclusions", "priorites"}


def test_init_db_idempotent(tmp_db):
    init_db(tmp_db)
    init_db(tmp_db)  # should not raise

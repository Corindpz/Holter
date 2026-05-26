import sqlite3
from contextlib import contextmanager


_db_path: str = "./holter.db"


def configure(path: str) -> None:
    global _db_path
    _db_path = path


@contextmanager
def get_db():
    conn = sqlite3.connect(_db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

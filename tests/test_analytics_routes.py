import sqlite3
import pytest
from fastapi.testclient import TestClient
from src.db.schema import init_db
from src.db.connection import configure


@pytest.fixture(autouse=True)
def setup_db(tmp_db):
    configure(tmp_db)
    init_db(tmp_db)


def get_client():
    from src.api.main import app
    return TestClient(app)


def test_get_trends_unknown_semaine_returns_404():
    r = get_client().get("/api/analytics/trends/2099-W99")
    assert r.status_code == 404


def test_post_priorities_unknown_semaine_returns_404():
    r = get_client().post("/api/analytics/priorities/2099-W99")
    assert r.status_code == 404


def test_get_priorities_no_cache_returns_404():
    r = get_client().get("/api/analytics/priorities/2099-W99")
    assert r.status_code == 404


def test_get_trends_known_semaine_returns_structure(tmp_db):
    conn = sqlite3.connect(tmp_db)
    conn.execute(
        "INSERT INTO semaines VALUES (?,?,?,?,?,?,?)",
        ("2026-W21", "2026-05-18", "2026-05-24", "Expert", "2026-05-18", 0, 1),
    )
    conn.commit()
    conn.close()
    r = get_client().get("/api/analytics/trends/2026-W21")
    assert r.status_code == 200
    data = r.json()
    assert "semaines" in data
    assert "series" in data
    assert "top_produits" in data


def test_post_priorities_incomplete_analysis_returns_404(tmp_db):
    conn = sqlite3.connect(tmp_db)
    conn.execute(
        "INSERT INTO semaines VALUES (?,?,?,?,?,?,?)",
        ("2026-W21", "2026-05-18", "2026-05-24", "Expert", "2026-05-18", 0, 0),
    )
    conn.commit()
    conn.close()
    r = get_client().post("/api/analytics/priorities/2026-W21")
    assert r.status_code == 404
    assert "complète" in r.json()["detail"]

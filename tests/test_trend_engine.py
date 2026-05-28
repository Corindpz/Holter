import sqlite3
import pytest
from src.db.schema import init_db
from src.db.connection import configure
from src.analytics.trend_engine import get_top_clusters, get_trend_series


@pytest.fixture(autouse=True)
def setup_db(tmp_db):
    configure(tmp_db)
    init_db(tmp_db)


def seed(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO semaines VALUES (?,?,?,?,?,?,?)",
        ("2026-W20", "2026-05-11", "2026-05-17", "Expert", "2026-05-11", 10, 1),
    )
    conn.execute(
        "INSERT INTO semaines VALUES (?,?,?,?,?,?,?)",
        ("2026-W21", "2026-05-18", "2026-05-24", "Expert", "2026-05-18", 10, 1),
    )
    # 3 tickets W20 — Easily / IV / MAJEUR
    for i in range(3):
        conn.execute(
            "INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)",
            (f"W20T{i}", "2026-W20", f"Objet {i}", "Normal", "Ouvert", "Easily", "CHU", "desc", "anon", "2026-05-11"),
        )
        conn.execute(
            "INSERT OR REPLACE INTO analyses VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (f"W20T{i}", "2026-W20", "ANALYSE_REQUISE", "IV", "MAJEUR", 0.9, "Raison", "[]", 0, None, "[]", 1),
        )
    # 6 tickets W21 — Easily / IV / MAJEUR
    for i in range(6):
        conn.execute(
            "INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)",
            (f"W21T{i}", "2026-W21", f"Objet {i}", "Normal", "Ouvert", "Easily", "CHU", "desc", "anon", "2026-05-18"),
        )
        conn.execute(
            "INSERT OR REPLACE INTO analyses VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (f"W21T{i}", "2026-W21", "ANALYSE_REQUISE", "IV", "MAJEUR", 0.9, "Raison", "[]", 0, None, "[]", 1),
        )
    # 1 ticket W21 — Harmo / MV / CRITIQUE (count < 2 → filtré)
    conn.execute(
        "INSERT INTO tickets VALUES (?,?,?,?,?,?,?,?,?,?)",
        ("W21T99", "2026-W21", "Objet 99", "Normal", "Ouvert", "Harmo", "CHU", "desc", "anon", "2026-05-18"),
    )
    conn.execute(
        "INSERT OR REPLACE INTO analyses VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        ("W21T99", "2026-W21", "ANALYSE_REQUISE", "MV", "CRITIQUE", 0.9, "Raison", "[]", 0, None, "[]", 1),
    )
    conn.commit()
    conn.close()


def test_get_top_clusters_returns_sorted_by_score(tmp_db):
    seed(tmp_db)
    clusters = get_top_clusters("2026-W21")
    assert len(clusters) == 1
    assert clusters[0].produit == "Easily"
    assert clusters[0].score == 100.0
    assert clusters[0].count_current == 6
    assert clusters[0].signal == "IV"
    assert clusters[0].niveau == "MAJEUR"


def test_get_top_clusters_filters_single_ticket(tmp_db):
    seed(tmp_db)
    clusters = get_top_clusters("2026-W21")
    assert all(c.produit != "Harmo" for c in clusters)


def test_velocite_and_avg_calculated_correctly(tmp_db):
    seed(tmp_db)
    clusters = get_top_clusters("2026-W21")
    c = clusters[0]
    # window=[W20,W21] len=2; avg=(3+6)/2=4.5; velocite=6/4.5=1.33
    assert c.avg_13s == 4.5
    assert round(c.velocite, 2) == 1.33


def test_get_top_clusters_no_data_returns_empty(tmp_db):
    clusters = get_top_clusters("2099-W99")
    assert clusters == []


def test_get_trend_series_returns_correct_structure(tmp_db):
    seed(tmp_db)
    data = get_trend_series("2026-W21")
    assert "semaines" in data
    assert "series" in data
    assert "top_produits" in data
    assert set(data["series"].keys()) == {"MV", "IV", "SECU"}


def test_get_trend_series_iv_count_correct(tmp_db):
    seed(tmp_db)
    data = get_trend_series("2026-W21")
    idx = data["semaines"].index("2026-W21")
    assert data["series"]["IV"][idx] == 6


def test_get_trend_series_no_data_returns_empty_lists(tmp_db):
    data = get_trend_series("2099-W99")
    assert data["semaines"] == []
    assert data["series"]["MV"] == []

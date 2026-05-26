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


def test_root_returns_html():
    client = get_client()
    r = client.get("/")
    assert r.status_code == 200


def test_dictionary_empty_on_start():
    client = get_client()
    r = client.get("/api/dictionary")
    assert r.status_code == 200
    assert r.json() == []


def test_add_and_list_dictionary():
    client = get_client()
    payload = {
        "pattern": "VIDAL KO", "signal": "MV", "niveau": "CRITIQUE",
        "cree_par": "Test", "date_creation": "2026-05-26"
    }
    r = client.post("/api/dictionary", json=payload)
    assert r.status_code == 200
    entries = client.get("/api/dictionary").json()
    assert len(entries) == 1
    assert entries[0]["pattern"] == "VIDAL KO"


def test_review_pending_zero_for_unknown_semaine():
    client = get_client()
    r = client.get("/api/review/pending/2099-W99")
    assert r.status_code == 200
    assert r.json()["pending"] == 0


def test_semaines_empty_on_start():
    client = get_client()
    r = client.get("/api/semaines")
    assert r.status_code == 200
    assert r.json() == []

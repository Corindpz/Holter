import pytest
from src.db.schema import init_db
from src.db.connection import configure, get_db
from src.review.review_manager import ReviewManager


@pytest.fixture(autouse=True)
def db(tmp_db):
    configure(tmp_db)
    init_db(tmp_db)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO semaines VALUES (?,?,?,?,?,?,?)",
            ("2026-W21", "2026-05-18", "2026-05-24", None, "2026-05-26", 2, 0)
        )
        conn.execute(
            "INSERT INTO tickets (id, semaine_code, objet, priorite) VALUES (?,?,?,?)",
            ("001", "2026-W21", "VIDAL KO", "Bloquant")
        )
        conn.execute(
            "INSERT INTO analyses (ticket_id, semaine_code, decision, signal, confiance, raisonnement) "
            "VALUES (?,?,?,?,?,?)",
            ("001", "2026-W21", "ANALYSE_REQUISE", "MV", 0.88, "Surdosage détecté")
        )


def test_record_decision_confirmer():
    rm = ReviewManager()
    rm.record("001", "2026-W21", expert="Jean", action="CONFIRMER", decision_finale="ANALYSE_REQUISE")
    decisions = rm.get_decisions("2026-W21")
    assert len(decisions) == 1
    assert decisions[0]["action_expert"] == "CONFIRMER"


def test_record_decision_reclasser_requires_comment():
    rm = ReviewManager()
    with pytest.raises(ValueError, match="commentaire"):
        rm.record("001", "2026-W21", expert="Jean", action="RECLASSER",
                  decision_finale="SURVEILLER", commentaire=None)


def test_record_decision_reclasser_with_comment():
    rm = ReviewManager()
    rm.record("001", "2026-W21", expert="Jean", action="RECLASSER",
              decision_finale="SURVEILLER", commentaire="Faux positif car version dev")
    decisions = rm.get_decisions("2026-W21")
    assert decisions[0]["commentaire"] == "Faux positif car version dev"


def test_pending_count_decreases_after_decision():
    rm = ReviewManager()
    assert rm.pending_count("2026-W21") == 1
    rm.record("001", "2026-W21", expert="Jean", action="CONFIRMER", decision_finale="ANALYSE_REQUISE")
    assert rm.pending_count("2026-W21") == 0


def test_set_and_get_week_expert():
    rm = ReviewManager()
    rm.set_week_expert("2026-W21", "Marie Dupont")
    expert = rm.get_week_expert("2026-W21")
    assert expert == "Marie Dupont"

import pytest
from src.export.pdf_generator import generate_pdf


def test_generate_pdf_returns_bytes():
    report_data = {
        "semaine_code": "2026-W21",
        "date_debut": "2026-05-18",
        "date_fin": "2026-05-24",
        "expert_nom": "Jean Martin",
        "generated_at": "2026-05-26T10:00:00Z",
        "model_used": "qwen2.5:32b-instruct-q4_K_M",
        "kpis": {"total": 5, "analyse_requise": 1, "surveiller": 1, "clos": 3},
        "tickets": [
            {
                "id": "00001", "objet": "VIDAL KO", "priorite": "Bloquant",
                "produit": "HM-Medical", "site": "CHU Lyon", "statut": "En cours",
                "decision": "ANALYSE_REQUISE", "signal": "MV", "niveau": "CRITIQUE",
                "confiance": 0.92, "raisonnement": "Alerte medicament detectee.",
                "articles_cites": ["MDR Art.87"], "capa_suggere": True,
                "action_expert": "CONFIRMER", "commentaire": None,
                "horodatage": "2026-05-26T10:05:00Z",
            }
        ],
        "dictionary_version": 5,
        "threshold_clos": 0.85,
    }
    pdf_bytes = generate_pdf(report_data)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 500
    assert pdf_bytes[:4] == b"%PDF"

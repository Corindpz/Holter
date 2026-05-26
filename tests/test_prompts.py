from src.analysis.prompts import build_pass1_messages, build_pass2_messages, build_pass3_messages, ANALYSIS_JSON_SCHEMA
from src.models import Ticket, DictionaryEntry


def test_pass1_messages_contain_ticket_objet():
    ticket = Ticket(id="001", semaine_code="2026-W21", objet="Alerte VIDAL KO", description_anonyme="Erreur VIDAL")
    msgs = build_pass1_messages(ticket, dictionary_entries=[])
    all_text = " ".join(m["content"] for m in msgs)
    assert "VIDAL KO" in all_text


def test_pass1_injects_dictionary_patterns():
    ticket = Ticket(id="001", semaine_code="2026-W21", objet="Test", description_anonyme="test")
    entry = DictionaryEntry(pattern="VIDAL KO", signal="MV", niveau="CRITIQUE",
                            article="MDR Art.87", cree_par="Jean", date_creation="2026-01-01",
                            poids="moyen")
    msgs = build_pass1_messages(ticket, dictionary_entries=[entry])
    all_text = " ".join(m["content"] for m in msgs)
    assert "VIDAL KO" in all_text
    assert "MV" in all_text


def test_pass2_messages_include_rag_passages():
    ticket = Ticket(id="001", semaine_code="2026-W21", objet="Test", description_anonyme="test")
    msgs = build_pass2_messages(ticket, dictionary_entries=[], rag_passages=["MDR Art.87 §1 texte"])
    all_text = " ".join(m["content"] for m in msgs)
    assert "MDR Art.87" in all_text


def test_pass3_messages_include_prior_analysis():
    ticket = Ticket(id="001", semaine_code="2026-W21", objet="Test", description_anonyme="test")
    prior = '{"decision": "CLOS", "confiance": 0.6}'
    msgs = build_pass3_messages(ticket, prior_analysis_json=prior)
    all_text = " ".join(m["content"] for m in msgs)
    assert "CLOS" in all_text


def test_json_schema_has_required_fields():
    assert "decision" in ANALYSIS_JSON_SCHEMA["required"]
    assert "confiance" in ANALYSIS_JSON_SCHEMA["required"]

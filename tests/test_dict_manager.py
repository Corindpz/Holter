import pytest
from src.db.schema import init_db
from src.db.connection import configure
from src.dictionary.dict_manager import DictionaryManager
from src.models import DictionaryEntry


@pytest.fixture(autouse=True)
def db(tmp_db):
    configure(tmp_db)
    init_db(tmp_db)


def test_add_entry():
    dm = DictionaryManager()
    entry = DictionaryEntry(pattern="VIDAL KO", signal="MV", niveau="CRITIQUE",
                            article="MDR Art.87", cree_par="Jean", date_creation="2026-05-26")
    dm.add(entry)
    entries = dm.list_all()
    assert len(entries) == 1
    assert entries[0].pattern == "VIDAL KO"
    assert entries[0].poids == "faible"


def test_add_duplicate_raises():
    dm = DictionaryManager()
    entry = DictionaryEntry(pattern="VIDAL KO", signal="MV", niveau="CRITIQUE",
                            cree_par="Jean", date_creation="2026-05-26")
    dm.add(entry)
    with pytest.raises(ValueError, match="déjà existant"):
        dm.add(entry)


def test_increment_validation_faible_to_moyen():
    dm = DictionaryManager()
    entry = DictionaryEntry(pattern="IPP doublon", signal="IV", niveau="MAJEUR",
                            cree_par="Marie", date_creation="2026-05-26")
    dm.add(entry)
    for _ in range(3):
        dm.increment_validation("IPP doublon")
    updated = dm.get("IPP doublon")
    assert updated.semaines_validees == 3
    assert updated.poids == "moyen"


def test_increment_validation_moyen_to_fort():
    dm = DictionaryManager()
    entry = DictionaryEntry(pattern="Prescription KO", signal="MV", niveau="MAJEUR",
                            cree_par="Jean", date_creation="2026-05-26",
                            semaines_validees=9, poids="moyen")
    dm.add(entry)
    dm.increment_validation("Prescription KO")
    updated = dm.get("Prescription KO")
    assert updated.poids == "fort"


def test_list_for_prompt_filters_by_weight():
    dm = DictionaryManager()
    dm.add(DictionaryEntry(pattern="A", signal="MV", niveau="CRITIQUE",
                           cree_par="J", date_creation="2026-05-26", poids="faible"))
    dm.add(DictionaryEntry(pattern="B", signal="IV", niveau="MAJEUR",
                           cree_par="J", date_creation="2026-05-26", poids="moyen"))
    result = dm.list_for_prompt()
    patterns = [e.pattern for e in result]
    assert "B" in patterns
    assert "A" not in patterns

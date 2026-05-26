from src.anonymizer.masker import mask_text


def test_masks_ipp():
    text = "Patient IPP 294919123 admission urgences"
    result = mask_text(text)
    assert "294919123" not in result
    assert "[PATIENT_ID]" in result


def test_masks_nda():
    text = "NDA 987654321 séjour du 01/01/2026"
    result = mask_text(text)
    assert "987654321" not in result
    assert "[NDA]" in result


def test_masks_date_naissance():
    text = "Né le 15/03/1962 à Paris"
    result = mask_text(text)
    assert "15/03/1962" not in result
    assert "[DATE_NAISSANCE]" in result


def test_masks_nom_in_blacklist():
    text = "Dossier patient DUPONT Jean intervention"
    result = mask_text(text, blacklist=["DUPONT"])
    assert "DUPONT" not in result
    assert "[NOM]" in result


def test_preserves_technical_content():
    text = "Erreur connexion base de données serveur PROD01"
    result = mask_text(text)
    assert "connexion" in result
    assert "PROD01" in result


def test_empty_text():
    assert mask_text("") == ""
    assert mask_text(None) == ""

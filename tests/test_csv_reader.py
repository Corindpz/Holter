import pytest
from src.importer.csv_reader import read_csv, normalize_ticket
from src.importer.deduplicator import deduplicate


def test_read_csv_returns_rows(sample_csv):
    mapping = {
        "id": "Case Number", "objet": "Subject", "priorite": "Priority",
        "statut": "Status", "produit": "Product__c", "site": "Account Name",
        "description": "Description", "date_creation": "Created Date",
    }
    rows = read_csv(sample_csv, mapping)
    assert len(rows) == 2
    assert rows[0]["id"] == "00001"
    assert rows[0]["priorite"] == "Bloquant"


def test_read_csv_unknown_encoding(tmp_path):
    latin_csv = tmp_path / "latin.csv"
    latin_csv.write_bytes(
        "Case Number,Subject,Priority,Status,Product__c,Account Name,Description,Created Date\n"
        "00003,Problème spécial,Important,Ouvert,Prod,Site,Desc,2026-05-20\n".encode("latin-1")
    )
    mapping = {
        "id": "Case Number", "objet": "Subject", "priorite": "Priority",
        "statut": "Status", "produit": "Product__c", "site": "Account Name",
        "description": "Description", "date_creation": "Created Date",
    }
    rows = read_csv(str(latin_csv), mapping)
    assert rows[0]["objet"] == "Problème spécial"


def test_normalize_ticket_sets_semaine_code():
    raw = {"id": "00001", "objet": "Test", "priorite": "Important",
           "statut": "Ouvert", "produit": "P", "site": "S",
           "description": "D", "date_creation": "2026-05-18"}
    ticket = normalize_ticket(raw, semaine_code="2026-W21")
    assert ticket.semaine_code == "2026-W21"
    assert ticket.id == "00001"


def test_read_xlsx_returns_rows(tmp_path):
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Case Number", "Subject", "Priority", "Status", "Product__c", "Account Name", "Description", "Created Date"])
    ws.append(["00010", "Erreur XLSX", "Bloquant", "Ouvert", "ProdX", "SiteX", "Desc XLSX", "2026-05-26"])
    xlsx_path = tmp_path / "export.xlsx"
    wb.save(str(xlsx_path))
    mapping = {
        "id": "Case Number", "objet": "Subject", "priorite": "Priority",
        "statut": "Status", "produit": "Product__c", "site": "Account Name",
        "description": "Description", "date_creation": "Created Date",
    }
    rows = read_csv(str(xlsx_path), mapping)
    assert len(rows) == 1
    assert rows[0]["id"] == "00010"
    assert rows[0]["priorite"] == "Bloquant"


def test_deduplicate_removes_existing(tmp_db):
    from src.db.schema import init_db
    from src.db.connection import configure, get_db
    configure(tmp_db)
    init_db(tmp_db)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO semaines VALUES (?,?,?,?,?,?,?)",
            ("2026-W21", "2026-05-18", "2026-05-24", None, "2026-05-26", 1, 0)
        )
        conn.execute(
            "INSERT INTO tickets (id, semaine_code, objet) VALUES (?,?,?)",
            ("00001", "2026-W21", "existant")
        )
    from src.models import Ticket
    tickets = [
        Ticket(id="00001", semaine_code="2026-W21", objet="existant"),
        Ticket(id="00002", semaine_code="2026-W21", objet="nouveau"),
    ]
    result = deduplicate(tickets, "2026-W21")
    assert len(result) == 1
    assert result[0].id == "00002"

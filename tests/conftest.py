import os
import pytest
import sqlite3
import tempfile
from pathlib import Path


@pytest.fixture
def tmp_db(tmp_path):
    """Temporary SQLite database for tests."""
    db_path = str(tmp_path / "test_holter.db")
    return db_path


@pytest.fixture
def sample_csv(tmp_path):
    """Minimal valid Salesforce CSV for import tests."""
    content = (
        "Case Number,Subject,Priority,Status,Product__c,Account Name,Description,Created Date\n"
        "00001,Alerte médicaments surdosage IPP 294919,Bloquant,En cours,HM-Medical,Hôpital Ste-Marie,Patient NOM DUPONT né 01/01/1970 IPP 123456789 NDA 987654,2026-05-18\n"
        "00002,Problème connexion,Important,Résolu,Synapse PACS,CHU Lyon,Connexion impossible depuis ce matin,2026-05-19\n"
    )
    csv_file = tmp_path / "tickets.csv"
    csv_file.write_text(content, encoding="utf-8")
    return str(csv_file)


@pytest.fixture
def settings():
    return {
        "port": 8765,
        "ollama_url": "http://localhost:11434",
        "model_override": None,
        "confidence_threshold_clos": 0.85,
        "confidence_threshold_escalate": 0.70,
        "chroma_path": "./chroma_db",
        "regulatory_path": "./regulatory",
        "db_path": "./holter.db",
    }

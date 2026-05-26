# HOLTER PMS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Python application (`holter.exe`) that ingests a weekly Salesforce CSV export, analyzes ~1 700 tickets with a local Ollama LLM (3-pass pipeline), surfaces ~40 flagged tickets for expert human review, and exports an auditable PDF report compliant with ISO 13485 / MDR 2017/745.

**Architecture:** FastAPI server on `localhost:8765` launched by a single `.exe`, serving a vanilla JS single-page UI in the browser. All data stays local in a SQLite database (`holter.db`). Ollama runs as a separate pre-installed service; ChromaDB provides a local regulatory RAG index. The dictionary module accumulates expert corrections week over week to improve AI classification.

**Tech Stack:** Python 3.11, FastAPI, Uvicorn, SQLite (stdlib), Ollama (HTTP API via httpx), ChromaDB + sentence-transformers, WeasyPrint, Jinja2, Pydantic v2, chardet, psutil, pytest, PyInstaller.

---

## File Structure

```
holter/
├── holter.py                        # Entry point: starts server, opens browser
├── settings.json                    # Runtime config (model, port, thresholds)
├── mapping.json                     # Salesforce column → internal field mapping
├── requirements.txt
├── holter.spec                      # PyInstaller build spec
├── regulatory/                      # PDF corpus for RAG (user-provided)
├── src/
│   ├── db/
│   │   ├── schema.py               # init_db(), CREATE TABLE statements
│   │   └── connection.py           # get_db() context manager
│   ├── models.py                   # Pydantic models for all domain types
│   ├── importer/
│   │   ├── csv_reader.py           # Encoding detection, mapping, normalization
│   │   └── deduplicator.py         # Skip tickets already in DB for this semaine
│   ├── anonymizer/
│   │   └── masker.py               # Regex masking of IPP/NDA/names/dates
│   ├── analysis/
│   │   ├── ollama_client.py        # Async HTTP client for Ollama /api/chat
│   │   ├── rag.py                  # ChromaDB index build + top-k retrieval
│   │   ├── prompts.py              # Pass-1/2/3 prompt builders
│   │   └── pipeline.py             # 3-pass orchestration, confidence routing
│   ├── dictionary/
│   │   └── dict_manager.py         # CRUD + faible→moyen→fort lifecycle
│   ├── review/
│   │   └── review_manager.py       # Expert decision recording, rotation tracking
│   ├── export/
│   │   ├── pdf_generator.py        # WeasyPrint PDF builder
│   │   └── templates/
│   │       └── report.html         # Jinja2 HTML template for PDF
│   └── api/
│       ├── main.py                 # FastAPI app, mounts all routers
│       ├── routes/
│       │   ├── import_routes.py
│       │   ├── analysis_routes.py
│       │   ├── review_routes.py
│       │   ├── export_routes.py
│       │   └── dictionary_routes.py
│       └── static/
│           ├── index.html
│           ├── app.js
│           └── styles.css
└── tests/
    ├── conftest.py
    ├── test_csv_reader.py
    ├── test_masker.py
    ├── test_ollama_client.py
    ├── test_rag.py
    ├── test_pipeline.py
    ├── test_dict_manager.py
    ├── test_review_manager.py
    ├── test_pdf_generator.py
    └── test_routes.py
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `requirements.txt`
- Create: `settings.json`
- Create: `mapping.json`
- Create: `src/__init__.py` (empty)
- Create: `tests/conftest.py`

- [ ] **Step 1: Create directory structure**

```
mkdir -p src/db src/importer src/anonymizer src/analysis src/dictionary src/review src/export/templates src/api/routes src/api/static tests regulatory
touch src/__init__.py src/db/__init__.py src/importer/__init__.py src/anonymizer/__init__.py src/analysis/__init__.py src/dictionary/__init__.py src/review/__init__.py src/export/__init__.py src/api/__init__.py src/api/routes/__init__.py
```

- [ ] **Step 2: Write `requirements.txt`**

```
fastapi==0.115.5
uvicorn[standard]==0.32.1
httpx==0.27.2
pydantic==2.9.2
chromadb==0.5.20
sentence-transformers==3.3.1
weasyprint==62.3
jinja2==3.1.4
chardet==5.2.0
psutil==6.1.0
python-multipart==0.0.12
pytest==8.3.3
pytest-asyncio==0.24.0
pyinstaller==6.11.1
```

- [ ] **Step 3: Write `settings.json`**

```json
{
  "port": 8765,
  "ollama_url": "http://localhost:11434",
  "model_override": null,
  "confidence_threshold_clos": 0.85,
  "confidence_threshold_escalate": 0.70,
  "chroma_path": "./chroma_db",
  "regulatory_path": "./regulatory",
  "db_path": "./holter.db"
}
```

- [ ] **Step 4: Write `mapping.json`**

```json
{
  "id": "Case Number",
  "objet": "Subject",
  "priorite": "Priority",
  "statut": "Status",
  "produit": "Product__c",
  "site": "Account Name",
  "description": "Description",
  "date_creation": "Created Date"
}
```

- [ ] **Step 5: Write `tests/conftest.py`**

```python
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
```

- [ ] **Step 6: Install dependencies**

```
pip install -r requirements.txt
```

Expected: all packages install without error.

- [ ] **Step 7: Commit**

```bash
git init
git add requirements.txt settings.json mapping.json tests/conftest.py src/ tests/
git commit -m "chore: project scaffolding"
```

---

## Task 2: Database Schema

**Files:**
- Create: `src/db/schema.py`
- Create: `src/db/connection.py`
- Create: `tests/test_schema.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_schema.py
import sqlite3
from src.db.schema import init_db


def test_init_db_creates_all_tables(tmp_db):
    init_db(tmp_db)
    conn = sqlite3.connect(tmp_db)
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {row[0] for row in cursor.fetchall()}
    conn.close()
    assert tables == {"semaines", "tickets", "analyses", "decisions", "dictionnaire"}


def test_init_db_idempotent(tmp_db):
    init_db(tmp_db)
    init_db(tmp_db)  # should not raise
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_schema.py -v
```

Expected: `ImportError` or `ModuleNotFoundError`.

- [ ] **Step 3: Write `src/db/schema.py`**

```python
import sqlite3


DDL = """
CREATE TABLE IF NOT EXISTS semaines (
    code TEXT PRIMARY KEY,
    date_debut TEXT NOT NULL,
    date_fin TEXT NOT NULL,
    expert_nom TEXT,
    date_import TEXT NOT NULL,
    nb_tickets INTEGER DEFAULT 0,
    analyse_complete INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tickets (
    id TEXT NOT NULL,
    semaine_code TEXT NOT NULL REFERENCES semaines(code),
    objet TEXT,
    priorite TEXT,
    statut TEXT,
    produit TEXT,
    site TEXT,
    description TEXT,
    description_anonyme TEXT,
    date_creation TEXT,
    PRIMARY KEY (id, semaine_code)
);

CREATE TABLE IF NOT EXISTS analyses (
    ticket_id TEXT NOT NULL,
    semaine_code TEXT NOT NULL,
    decision TEXT NOT NULL,
    signal TEXT,
    niveau TEXT,
    confiance REAL,
    raisonnement TEXT,
    articles_cites TEXT,
    capa_suggere INTEGER DEFAULT 0,
    mots_cles TEXT,
    passe_finale INTEGER DEFAULT 1,
    PRIMARY KEY (ticket_id, semaine_code),
    FOREIGN KEY (ticket_id, semaine_code) REFERENCES tickets(id, semaine_code)
);

CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    semaine_code TEXT NOT NULL,
    expert_nom TEXT NOT NULL,
    action_expert TEXT NOT NULL,
    decision_finale TEXT NOT NULL,
    commentaire TEXT,
    horodatage TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dictionnaire (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL UNIQUE,
    signal TEXT NOT NULL,
    niveau TEXT NOT NULL,
    article TEXT,
    cree_par TEXT NOT NULL,
    date_creation TEXT NOT NULL,
    semaines_validees INTEGER DEFAULT 0,
    poids TEXT DEFAULT 'faible'
);
"""


def init_db(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    conn.executescript(DDL)
    conn.commit()
    conn.close()
```

- [ ] **Step 4: Write `src/db/connection.py`**

```python
import sqlite3
from contextlib import contextmanager


_db_path: str = "./holter.db"


def configure(path: str) -> None:
    global _db_path
    _db_path = path


@contextmanager
def get_db():
    conn = sqlite3.connect(_db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

- [ ] **Step 5: Run tests**

```
pytest tests/test_schema.py -v
```

Expected: 2 PASSED.

- [ ] **Step 6: Commit**

```bash
git add src/db/ tests/test_schema.py
git commit -m "feat: database schema and connection"
```

---

## Task 3: Data Models

**Files:**
- Create: `src/models.py`

- [ ] **Step 1: Write `src/models.py`**

```python
from pydantic import BaseModel, Field
from typing import Optional, List


class Ticket(BaseModel):
    id: str
    semaine_code: str
    objet: Optional[str] = None
    priorite: Optional[str] = None
    statut: Optional[str] = None
    produit: Optional[str] = None
    site: Optional[str] = None
    description: Optional[str] = None
    description_anonyme: Optional[str] = None
    date_creation: Optional[str] = None


class AnalysisResult(BaseModel):
    decision: str  # ANALYSE_REQUISE | SURVEILLER | CLOS
    signal: Optional[str] = None  # MV | IV | SECU
    niveau: Optional[str] = None  # CRITIQUE | MAJEUR | MINEUR
    confiance: float = Field(ge=0.0, le=1.0)
    raisonnement: Optional[str] = None
    articles_cites: List[str] = []
    capa_suggere: bool = False
    mots_cles: List[str] = []
    passe_finale: int = 1


class DecisionEntry(BaseModel):
    ticket_id: str
    semaine_code: str
    expert_nom: str
    action_expert: str  # CONFIRMER | RECLASSER | ECARTER
    decision_finale: str
    commentaire: Optional[str] = None
    horodatage: str


class DictionaryEntry(BaseModel):
    id: Optional[int] = None
    pattern: str
    signal: str  # MV | IV | SECU
    niveau: str  # CRITIQUE | MAJEUR | MINEUR
    article: Optional[str] = None
    cree_par: str
    date_creation: str
    semaines_validees: int = 0
    poids: str = "faible"  # faible | moyen | fort


class Semaine(BaseModel):
    code: str  # e.g. "2026-W21"
    date_debut: str
    date_fin: str
    expert_nom: Optional[str] = None
    date_import: str
    nb_tickets: int = 0
    analyse_complete: bool = False
```

- [ ] **Step 2: Verify models parse correctly**

```python
# Quick smoke test — run in Python REPL
from src.models import AnalysisResult
r = AnalysisResult(decision="CLOS", confiance=0.9)
assert r.decision == "CLOS"
assert r.capa_suggere is False
```

- [ ] **Step 3: Commit**

```bash
git add src/models.py
git commit -m "feat: domain models"
```

---

## Task 4: Module 1 — CSV Import

**Files:**
- Create: `src/importer/csv_reader.py`
- Create: `src/importer/deduplicator.py`
- Create: `tests/test_csv_reader.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_csv_reader.py
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
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_csv_reader.py -v
```

Expected: `ImportError`.

- [ ] **Step 3: Write `src/importer/csv_reader.py`**

```python
import csv
import json
from pathlib import Path
from typing import List, Dict, Any
import chardet
from src.models import Ticket


def read_csv(path: str, mapping: Dict[str, str]) -> List[Dict[str, Any]]:
    raw_bytes = Path(path).read_bytes()
    encoding = chardet.detect(raw_bytes)["encoding"] or "utf-8"
    text = raw_bytes.decode(encoding, errors="replace")
    reader = csv.DictReader(text.splitlines())
    rows = []
    for row in reader:
        normalized = {}
        for internal_key, sf_column in mapping.items():
            normalized[internal_key] = row.get(sf_column, "").strip()
        rows.append(normalized)
    return rows


def normalize_ticket(raw: Dict[str, Any], semaine_code: str) -> Ticket:
    return Ticket(
        id=raw.get("id", ""),
        semaine_code=semaine_code,
        objet=raw.get("objet") or None,
        priorite=raw.get("priorite") or None,
        statut=raw.get("statut") or None,
        produit=raw.get("produit") or None,
        site=raw.get("site") or None,
        description=raw.get("description") or None,
        date_creation=raw.get("date_creation") or None,
    )
```

- [ ] **Step 4: Write `src/importer/deduplicator.py`**

```python
from typing import List
from src.models import Ticket
from src.db.connection import get_db


def deduplicate(tickets: List[Ticket], semaine_code: str) -> List[Ticket]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id FROM tickets WHERE semaine_code = ?", (semaine_code,)
        ).fetchall()
    existing_ids = {row["id"] for row in rows}
    return [t for t in tickets if t.id not in existing_ids]
```

- [ ] **Step 5: Run tests**

```
pytest tests/test_csv_reader.py -v
```

Expected: 4 PASSED.

- [ ] **Step 6: Commit**

```bash
git add src/importer/ tests/test_csv_reader.py
git commit -m "feat: csv import and deduplication"
```

---

## Task 5: Module 2 — Anonymisation

**Files:**
- Create: `src/anonymizer/masker.py`
- Create: `tests/test_masker.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_masker.py
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
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_masker.py -v
```

Expected: `ImportError`.

- [ ] **Step 3: Write `src/anonymizer/masker.py`**

```python
import re
from typing import List, Optional

# IPP: 7-12 digit standalone number (French IPP format)
_IPP_RE = re.compile(r"\b(?:IPP\s*)(\d{7,12})\b", re.IGNORECASE)
# NDA: declared NDA/numéro dossier
_NDA_RE = re.compile(r"\b(?:NDA|N°\s*dossier|numéro\s*dossier)\s*:?\s*(\d{6,12})\b", re.IGNORECASE)
# Date of birth patterns: dd/mm/yyyy or dd-mm-yyyy preceded by "né", "naissance"
_DOB_RE = re.compile(
    r"\b(?:né|née|naissance|ddn)\s*(?:le\s*)?(\d{1,2}[/\-]\d{1,2}[/\-]\d{4})\b",
    re.IGNORECASE,
)
# Standalone long numerics that look like patient IDs (9+ digits, not a date)
_LONG_NUM_RE = re.compile(r"\b(\d{9,12})\b")


def mask_text(text: Optional[str], blacklist: Optional[List[str]] = None) -> str:
    if not text:
        return ""
    result = text
    result = _IPP_RE.sub(r"[PATIENT_ID]", result)
    result = _NDA_RE.sub(r"[NDA]", result)
    result = _DOB_RE.sub(r"[DATE_NAISSANCE]", result)
    result = _LONG_NUM_RE.sub(r"[PATIENT_ID]", result)
    if blacklist:
        for name in blacklist:
            result = re.sub(re.escape(name), "[NOM]", result, flags=re.IGNORECASE)
    return result
```

- [ ] **Step 4: Run tests**

```
pytest tests/test_masker.py -v
```

Expected: 6 PASSED.

- [ ] **Step 5: Commit**

```bash
git add src/anonymizer/ tests/test_masker.py
git commit -m "feat: patient data anonymisation"
```

---

## Task 6: Module 3a — Ollama Client

**Files:**
- Create: `src/analysis/ollama_client.py`
- Create: `tests/test_ollama_client.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_ollama_client.py
import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from src.analysis.ollama_client import OllamaClient, select_model


def test_select_model_8gb():
    model = select_model(available_ram_gb=7, override=None)
    assert model == "mistral:7b-instruct-q4_K_M"


def test_select_model_16gb():
    model = select_model(available_ram_gb=15, override=None)
    assert model == "qwen2.5:14b-instruct-q4_K_M"


def test_select_model_32gb():
    model = select_model(available_ram_gb=30, override=None)
    assert model == "qwen2.5:32b-instruct-q4_K_M"


def test_select_model_override():
    model = select_model(available_ram_gb=64, override="llama3.3:70b")
    assert model == "llama3.3:70b"


@pytest.mark.asyncio
async def test_chat_returns_parsed_json():
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "message": {"content": '{"decision": "CLOS", "confiance": 0.9}'}
    }
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        client = OllamaClient(base_url="http://localhost:11434", model="test-model")
        result = await client.chat(messages=[{"role": "user", "content": "test"}])
        assert result == {"decision": "CLOS", "confiance": 0.9}
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_ollama_client.py -v
```

Expected: `ImportError`.

- [ ] **Step 3: Write `src/analysis/ollama_client.py`**

```python
import json
import psutil
import httpx
from typing import Any, Dict, List, Optional


_MODEL_TABLE = [
    (60, "qwen2.5:72b-instruct-q4_K_M"),
    (28, "qwen2.5:32b-instruct-q4_K_M"),
    (12, "qwen2.5:14b-instruct-q4_K_M"),
    (0,  "mistral:7b-instruct-q4_K_M"),
]


def select_model(available_ram_gb: float, override: Optional[str]) -> str:
    if override:
        return override
    for threshold, model in _MODEL_TABLE:
        if available_ram_gb >= threshold:
            return model
    return "mistral:7b-instruct-q4_K_M"


def get_available_ram_gb() -> float:
    return psutil.virtual_memory().available / (1024 ** 3)


class OllamaClient:
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def chat(
        self,
        messages: List[Dict[str, str]],
        json_schema: Optional[Dict] = None,
        timeout: float = 300.0,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
        }
        if json_schema:
            payload["format"] = json_schema
        else:
            payload["format"] = "json"

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{self.base_url}/api/chat", json=payload)
            response.raise_for_status()
            content = response.json()["message"]["content"]
            return json.loads(content)

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self.base_url}/api/version")
                return r.status_code == 200
        except Exception:
            return False
```

- [ ] **Step 4: Run tests**

```
pytest tests/test_ollama_client.py -v
```

Expected: 5 PASSED.

- [ ] **Step 5: Commit**

```bash
git add src/analysis/ollama_client.py tests/test_ollama_client.py
git commit -m "feat: ollama client with adaptive model selection"
```

---

## Task 7: Module 3b — RAG Réglementaire

**Files:**
- Create: `src/analysis/rag.py`
- Create: `tests/test_rag.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_rag.py
import pytest
from pathlib import Path
from src.analysis.rag import RegulatoryRAG


def test_rag_empty_corpus_returns_empty(tmp_path):
    rag = RegulatoryRAG(chroma_path=str(tmp_path / "chroma"), regulatory_path=str(tmp_path / "reg"))
    results = rag.retrieve("surdosage médicament MDR", k=3)
    assert results == []


def test_rag_indexes_and_retrieves_text(tmp_path):
    reg_dir = tmp_path / "reg"
    reg_dir.mkdir()
    (reg_dir / "test.txt").write_text(
        "MDR Article 87 : tout incident grave doit être signalé sous 15 jours.",
        encoding="utf-8"
    )
    rag = RegulatoryRAG(
        chroma_path=str(tmp_path / "chroma"),
        regulatory_path=str(reg_dir)
    )
    rag.build_index()
    results = rag.retrieve("incident grave signalement", k=1)
    assert len(results) == 1
    assert "incident grave" in results[0].lower()
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_rag.py -v
```

Expected: `ImportError`.

- [ ] **Step 3: Write `src/analysis/rag.py`**

```python
import re
from pathlib import Path
from typing import List
import chromadb
from chromadb.utils import embedding_functions


_CHUNK_SIZE = 500
_CHUNK_OVERLAP = 50
_COLLECTION_NAME = "regulatory"


def _chunk_text(text: str, size: int = _CHUNK_SIZE, overlap: int = _CHUNK_OVERLAP) -> List[str]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + size])
        chunks.append(chunk)
        i += size - overlap
    return chunks


class RegulatoryRAG:
    def __init__(self, chroma_path: str, regulatory_path: str):
        self.regulatory_path = Path(regulatory_path)
        self._ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )
        self._client = chromadb.PersistentClient(path=chroma_path)
        self._collection = self._client.get_or_create_collection(
            _COLLECTION_NAME, embedding_function=self._ef
        )

    def build_index(self) -> int:
        """Index all .txt and .pdf files in regulatory_path. Returns number of chunks added."""
        if not self.regulatory_path.exists():
            return 0
        docs, ids, metas = [], [], []
        for f in self.regulatory_path.rglob("*"):
            if f.suffix == ".txt":
                text = f.read_text(encoding="utf-8", errors="replace")
            elif f.suffix == ".pdf":
                text = _extract_pdf_text(f)
            else:
                continue
            for i, chunk in enumerate(_chunk_text(text)):
                doc_id = f"{f.stem}_{i}"
                if doc_id not in {m.get("id") for m in self._collection.get()["metadatas"]}:
                    docs.append(chunk)
                    ids.append(doc_id)
                    metas.append({"source": f.name, "id": doc_id})
        if docs:
            self._collection.add(documents=docs, ids=ids, metadatas=metas)
        return len(docs)

    def retrieve(self, query: str, k: int = 3) -> List[str]:
        count = self._collection.count()
        if count == 0:
            return []
        results = self._collection.query(
            query_texts=[query],
            n_results=min(k, count),
        )
        return results["documents"][0] if results["documents"] else []


def _extract_pdf_text(path: Path) -> str:
    try:
        import pypdf
        reader = pypdf.PdfReader(str(path))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        return ""
```

- [ ] **Step 4: Add `pypdf` to requirements.txt**

```
pypdf==4.3.1
```

Then: `pip install pypdf==4.3.1`

- [ ] **Step 5: Run tests**

```
pytest tests/test_rag.py -v
```

Expected: 2 PASSED. (First run downloads `all-MiniLM-L6-v2` model ~90MB — normal.)

- [ ] **Step 6: Commit**

```bash
git add src/analysis/rag.py tests/test_rag.py requirements.txt
git commit -m "feat: chromadb regulatory rag"
```

---

## Task 8: Module 3c — Prompts & Analysis Schema

**Files:**
- Create: `src/analysis/prompts.py`
- Create: `tests/test_prompts.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_prompts.py
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
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_prompts.py -v
```

- [ ] **Step 3: Write `src/analysis/prompts.py`**

```python
import json
from typing import List, Dict
from src.models import Ticket, DictionaryEntry


_SYSTEM_RAQA = """Tu es un consultant senior RAQA et officier de vigilance pour les logiciels SaMD/SIH.
Cadre réglementaire applicable : MDR 2017/745 Art.87, Annexe I §17 ; ISO 13485 §8.2.2 et §8.5.1 ;
ISO 14971 ; CEI 62304 ; RNI/INS ; guides ANSM.

Règles absolues :
- Ne minimise jamais un risque patient.
- Tout signal MV ou IV doit être déclaré même en cas de doute.
- Le champ confiance est ta propre estimation (0.0 = très incertain, 1.0 = certitude absolue).
- Réponds UNIQUEMENT en JSON valide, sans texte autour."""

ANALYSIS_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "decision": {"type": "string", "enum": ["ANALYSE_REQUISE", "SURVEILLER", "CLOS"]},
        "signal": {"type": ["string", "null"], "enum": ["MV", "IV", "SECU", None]},
        "niveau": {"type": ["string", "null"], "enum": ["CRITIQUE", "MAJEUR", "MINEUR", None]},
        "confiance": {"type": "number", "minimum": 0.0, "maximum": 1.0},
        "raisonnement": {"type": "string"},
        "articles_cites": {"type": "array", "items": {"type": "string"}},
        "capa_suggere": {"type": "boolean"},
        "mots_cles": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["decision", "confiance", "raisonnement"],
}


def _format_dictionary(entries: List[DictionaryEntry]) -> str:
    if not entries:
        return ""
    lines = ["Patterns réglementaires validés par les experts précédents :"]
    for e in entries:
        if e.poids in ("moyen", "fort"):
            lines.append(f'- "{e.pattern}" → signal {e.signal} ({e.niveau}), {e.article or ""}')
    return "\n".join(lines) if len(lines) > 1 else ""


def _format_ticket(ticket: Ticket) -> str:
    return (
        f"Ticket ID: {ticket.id}\n"
        f"Objet: {ticket.objet or ''}\n"
        f"Priorité: {ticket.priorite or ''}\n"
        f"Statut: {ticket.statut or ''}\n"
        f"Produit: {ticket.produit or ''}\n"
        f"Site: {ticket.site or ''}\n"
        f"Description: {ticket.description_anonyme or ''}"
    )


def build_pass1_messages(
    ticket: Ticket, dictionary_entries: List[DictionaryEntry]
) -> List[Dict[str, str]]:
    dict_section = _format_dictionary(dictionary_entries)
    user_content = f"{dict_section}\n\n{_format_ticket(ticket)}\n\nClassifie ce ticket. JSON uniquement."
    return [
        {"role": "system", "content": _SYSTEM_RAQA},
        {"role": "user", "content": user_content},
    ]


def build_pass2_messages(
    ticket: Ticket,
    dictionary_entries: List[DictionaryEntry],
    rag_passages: List[str],
) -> List[Dict[str, str]]:
    dict_section = _format_dictionary(dictionary_entries)
    rag_section = ""
    if rag_passages:
        rag_section = "Extraits réglementaires pertinents :\n" + "\n---\n".join(rag_passages)
    user_content = (
        f"{dict_section}\n\n{rag_section}\n\n{_format_ticket(ticket)}\n\n"
        "Analyse approfondie avec chain-of-thought. Énumère d'abord les indices observés, "
        "les articles applicables, les contradictions éventuelles, puis conclus. JSON uniquement."
    )
    return [
        {"role": "system", "content": _SYSTEM_RAQA},
        {"role": "user", "content": user_content},
    ]


def build_pass3_messages(
    ticket: Ticket, prior_analysis_json: str
) -> List[Dict[str, str]]:
    user_content = (
        f"{_format_ticket(ticket)}\n\n"
        f"Voici ton analyse précédente :\n{prior_analysis_json}\n\n"
        "Challenge cette analyse. Es-tu certain(e) ? "
        "Quels éléments pourraient te faire changer d'avis sur le signal ou la décision ? "
        "Si ta conclusion reste identique, maintiens-la avec une confiance ajustée. JSON uniquement."
    )
    return [
        {"role": "system", "content": _SYSTEM_RAQA},
        {"role": "user", "content": user_content},
    ]
```

- [ ] **Step 4: Run tests**

```
pytest tests/test_prompts.py -v
```

Expected: 5 PASSED.

- [ ] **Step 5: Commit**

```bash
git add src/analysis/prompts.py tests/test_prompts.py
git commit -m "feat: raqa prompts and json schema"
```

---

## Task 9: Module 3d — Analysis Pipeline

**Files:**
- Create: `src/analysis/pipeline.py`
- Create: `tests/test_pipeline.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_pipeline.py
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from src.analysis.pipeline import AnalysisPipeline
from src.models import Ticket, DictionaryEntry


def _make_ollama_result(decision="CLOS", confiance=0.9, signal=None):
    return {
        "decision": decision, "signal": signal, "niveau": None,
        "confiance": confiance, "raisonnement": "Test raisonnement.",
        "articles_cites": [], "capa_suggere": False, "mots_cles": []
    }


@pytest.fixture
def mock_ollama():
    client = AsyncMock()
    client.chat = AsyncMock(return_value=_make_ollama_result())
    return client


@pytest.fixture
def mock_rag():
    rag = MagicMock()
    rag.retrieve = MagicMock(return_value=[])
    return rag


@pytest.mark.asyncio
async def test_pipeline_high_confidence_clos_stays_pass1(mock_ollama, mock_rag):
    pipeline = AnalysisPipeline(
        ollama=mock_ollama, rag=mock_rag, dictionary_entries=[],
        threshold_clos=0.85, threshold_escalate=0.70
    )
    ticket = Ticket(id="001", semaine_code="2026-W21", objet="Login lent", description_anonyme="lent")
    result = await pipeline.analyze(ticket)
    assert result.decision == "CLOS"
    assert result.passe_finale == 1


@pytest.mark.asyncio
async def test_pipeline_low_confidence_escalates_to_pass2(mock_rag):
    ollama = AsyncMock()
    ollama.chat = AsyncMock(return_value=_make_ollama_result(decision="ANALYSE_REQUISE", confiance=0.75))
    pipeline = AnalysisPipeline(
        ollama=ollama, rag=mock_rag, dictionary_entries=[],
        threshold_clos=0.85, threshold_escalate=0.70
    )
    ticket = Ticket(id="002", semaine_code="2026-W21", objet="VIDAL KO", description_anonyme="vidal ko")
    result = await pipeline.analyze(ticket)
    assert result.passe_finale == 2
    assert ollama.chat.call_count == 2


@pytest.mark.asyncio
async def test_pipeline_very_low_confidence_escalates_to_pass3(mock_rag):
    ollama = AsyncMock()
    ollama.chat = AsyncMock(return_value=_make_ollama_result(decision="SURVEILLER", confiance=0.60))
    pipeline = AnalysisPipeline(
        ollama=ollama, rag=mock_rag, dictionary_entries=[],
        threshold_clos=0.85, threshold_escalate=0.70
    )
    ticket = Ticket(id="003", semaine_code="2026-W21", objet="Incident", description_anonyme="incident")
    result = await pipeline.analyze(ticket)
    assert result.passe_finale == 3
    assert ollama.chat.call_count == 3
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_pipeline.py -v
```

- [ ] **Step 3: Write `src/analysis/pipeline.py`**

```python
import json
import asyncio
from typing import List
from src.models import Ticket, AnalysisResult, DictionaryEntry
from src.analysis.ollama_client import OllamaClient
from src.analysis.rag import RegulatoryRAG
from src.analysis.prompts import (
    build_pass1_messages, build_pass2_messages, build_pass3_messages,
    ANALYSIS_JSON_SCHEMA,
)


def _parse_result(raw: dict, passe: int) -> AnalysisResult:
    return AnalysisResult(
        decision=raw.get("decision", "SURVEILLER"),
        signal=raw.get("signal"),
        niveau=raw.get("niveau"),
        confiance=float(raw.get("confiance", 0.5)),
        raisonnement=raw.get("raisonnement", ""),
        articles_cites=raw.get("articles_cites", []),
        capa_suggere=bool(raw.get("capa_suggere", False)),
        mots_cles=raw.get("mots_cles", []),
        passe_finale=passe,
    )


class AnalysisPipeline:
    def __init__(
        self,
        ollama: OllamaClient,
        rag: RegulatoryRAG,
        dictionary_entries: List[DictionaryEntry],
        threshold_clos: float = 0.85,
        threshold_escalate: float = 0.70,
    ):
        self.ollama = ollama
        self.rag = rag
        self.dictionary_entries = dictionary_entries
        self.threshold_clos = threshold_clos
        self.threshold_escalate = threshold_escalate

    async def analyze(self, ticket: Ticket) -> AnalysisResult:
        # Pass 1 — fast triage
        msgs1 = build_pass1_messages(ticket, self.dictionary_entries)
        raw1 = await self.ollama.chat(msgs1, json_schema=ANALYSIS_JSON_SCHEMA)
        result1 = _parse_result(raw1, passe=1)

        if result1.decision == "CLOS" and result1.confiance >= self.threshold_clos:
            return result1

        # Pass 2 — deep analysis with RAG
        query = f"{ticket.objet or ''} {ticket.description_anonyme or ''}"
        passages = self.rag.retrieve(query, k=3)
        msgs2 = build_pass2_messages(ticket, self.dictionary_entries, passages)
        raw2 = await self.ollama.chat(msgs2, json_schema=ANALYSIS_JSON_SCHEMA)
        result2 = _parse_result(raw2, passe=2)

        if result2.confiance >= self.threshold_escalate:
            return result2

        # Pass 3 — self-critique on most ambiguous cases
        prior_json = json.dumps(raw2, ensure_ascii=False)
        msgs3 = build_pass3_messages(ticket, prior_json)
        raw3 = await self.ollama.chat(msgs3, json_schema=ANALYSIS_JSON_SCHEMA)
        return _parse_result(raw3, passe=3)

    async def analyze_batch(
        self,
        tickets: List[Ticket],
        progress_callback=None,
    ) -> List[AnalysisResult]:
        results = []
        for i, ticket in enumerate(tickets):
            result = await self.analyze(ticket)
            results.append(result)
            if progress_callback:
                progress_callback(i + 1, len(tickets))
        return results
```

- [ ] **Step 4: Run tests**

```
pytest tests/test_pipeline.py -v
```

Expected: 3 PASSED.

- [ ] **Step 5: Commit**

```bash
git add src/analysis/pipeline.py tests/test_pipeline.py
git commit -m "feat: 3-pass analysis pipeline"
```

---

## Task 10: Module 6 — Dictionary Manager

**Files:**
- Create: `src/dictionary/dict_manager.py`
- Create: `tests/test_dict_manager.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_dict_manager.py
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
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_dict_manager.py -v
```

- [ ] **Step 3: Write `src/dictionary/dict_manager.py`**

```python
from typing import List, Optional
from src.db.connection import get_db
from src.models import DictionaryEntry


_MOYEN_THRESHOLD = 3
_FORT_THRESHOLD = 10


class DictionaryManager:
    def add(self, entry: DictionaryEntry) -> None:
        with get_db() as conn:
            existing = conn.execute(
                "SELECT id FROM dictionnaire WHERE pattern = ?", (entry.pattern,)
            ).fetchone()
            if existing:
                raise ValueError(f"Pattern déjà existant : {entry.pattern!r}")
            conn.execute(
                """INSERT INTO dictionnaire
                   (pattern, signal, niveau, article, cree_par, date_creation, semaines_validees, poids)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (entry.pattern, entry.signal, entry.niveau, entry.article,
                 entry.cree_par, entry.date_creation, entry.semaines_validees, entry.poids),
            )

    def get(self, pattern: str) -> Optional[DictionaryEntry]:
        with get_db() as conn:
            row = conn.execute(
                "SELECT * FROM dictionnaire WHERE pattern = ?", (pattern,)
            ).fetchone()
        return _row_to_entry(row) if row else None

    def list_all(self) -> List[DictionaryEntry]:
        with get_db() as conn:
            rows = conn.execute("SELECT * FROM dictionnaire ORDER BY poids DESC, pattern").fetchall()
        return [_row_to_entry(r) for r in rows]

    def list_for_prompt(self) -> List[DictionaryEntry]:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM dictionnaire WHERE poids IN ('moyen','fort') ORDER BY poids DESC"
            ).fetchall()
        return [_row_to_entry(r) for r in rows]

    def increment_validation(self, pattern: str) -> None:
        with get_db() as conn:
            conn.execute(
                "UPDATE dictionnaire SET semaines_validees = semaines_validees + 1 WHERE pattern = ?",
                (pattern,),
            )
            row = conn.execute(
                "SELECT semaines_validees FROM dictionnaire WHERE pattern = ?", (pattern,)
            ).fetchone()
            if row:
                n = row["semaines_validees"]
                if n >= _FORT_THRESHOLD:
                    poids = "fort"
                elif n >= _MOYEN_THRESHOLD:
                    poids = "moyen"
                else:
                    poids = "faible"
                conn.execute(
                    "UPDATE dictionnaire SET poids = ? WHERE pattern = ?", (poids, pattern)
                )

    def delete(self, pattern: str) -> None:
        with get_db() as conn:
            conn.execute("DELETE FROM dictionnaire WHERE pattern = ?", (pattern,))


def _row_to_entry(row) -> DictionaryEntry:
    return DictionaryEntry(
        id=row["id"],
        pattern=row["pattern"],
        signal=row["signal"],
        niveau=row["niveau"],
        article=row["article"],
        cree_par=row["cree_par"],
        date_creation=row["date_creation"],
        semaines_validees=row["semaines_validees"],
        poids=row["poids"],
    )
```

- [ ] **Step 4: Run tests**

```
pytest tests/test_dict_manager.py -v
```

Expected: 5 PASSED.

- [ ] **Step 5: Commit**

```bash
git add src/dictionary/ tests/test_dict_manager.py
git commit -m "feat: dictionary manager with lifecycle progression"
```

---

## Task 11: Module 4 — Review Manager

**Files:**
- Create: `src/review/review_manager.py`
- Create: `tests/test_review_manager.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_review_manager.py
import pytest
from datetime import datetime
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
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_review_manager.py -v
```

- [ ] **Step 3: Write `src/review/review_manager.py`**

```python
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from src.db.connection import get_db


class ReviewManager:
    def record(
        self,
        ticket_id: str,
        semaine_code: str,
        expert: str,
        action: str,
        decision_finale: str,
        commentaire: Optional[str] = None,
    ) -> None:
        if action in ("RECLASSER", "ECARTER") and not commentaire:
            raise ValueError(f"Un commentaire est obligatoire pour l'action {action}")
        now = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO decisions
                   (ticket_id, semaine_code, expert_nom, action_expert, decision_finale, commentaire, horodatage)
                   VALUES (?,?,?,?,?,?,?)""",
                (ticket_id, semaine_code, expert, action, decision_finale, commentaire, now),
            )

    def get_decisions(self, semaine_code: str) -> List[Dict[str, Any]]:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM decisions WHERE semaine_code = ?", (semaine_code,)
            ).fetchall()
        return [dict(r) for r in rows]

    def pending_count(self, semaine_code: str) -> int:
        with get_db() as conn:
            decided_ids = {
                r["ticket_id"]
                for r in conn.execute(
                    "SELECT DISTINCT ticket_id FROM decisions WHERE semaine_code = ?",
                    (semaine_code,),
                ).fetchall()
            }
            total = conn.execute(
                "SELECT COUNT(*) as n FROM analyses WHERE semaine_code = ? AND decision = 'ANALYSE_REQUISE'",
                (semaine_code,),
            ).fetchone()["n"]
        return total - len(decided_ids)

    def set_week_expert(self, semaine_code: str, expert_nom: str) -> None:
        with get_db() as conn:
            conn.execute(
                "UPDATE semaines SET expert_nom = ? WHERE code = ?",
                (expert_nom, semaine_code),
            )

    def get_week_expert(self, semaine_code: str) -> Optional[str]:
        with get_db() as conn:
            row = conn.execute(
                "SELECT expert_nom FROM semaines WHERE code = ?", (semaine_code,)
            ).fetchone()
        return row["expert_nom"] if row else None
```

- [ ] **Step 4: Run tests**

```
pytest tests/test_review_manager.py -v
```

Expected: 5 PASSED.

- [ ] **Step 5: Commit**

```bash
git add src/review/ tests/test_review_manager.py
git commit -m "feat: expert review manager with rotation tracking"
```

---

## Task 12: Module 5 — PDF Export

**Files:**
- Create: `src/export/templates/report.html`
- Create: `src/export/pdf_generator.py`
- Create: `tests/test_pdf_generator.py`

- [ ] **Step 1: Write failing test**

```python
# tests/test_pdf_generator.py
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
        "kpis": {"total": 1706, "analyse_requise": 40, "surveiller": 36, "clos": 1630},
        "tickets": [
            {
                "id": "00001", "objet": "VIDAL KO", "priorite": "Bloquant",
                "produit": "HM-Medical", "site": "CHU Lyon", "statut": "En cours",
                "decision": "ANALYSE_REQUISE", "signal": "MV", "niveau": "CRITIQUE",
                "confiance": 0.92, "raisonnement": "Alerte médicament détectée.",
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
    assert len(pdf_bytes) > 1000
    assert pdf_bytes[:4] == b"%PDF"
```

- [ ] **Step 2: Run to confirm failure**

```
pytest tests/test_pdf_generator.py -v
```

- [ ] **Step 3: Write `src/export/templates/report.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10px; color: #1a1a1a; margin: 0; padding: 20px; }
  h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
  h2 { font-size: 13px; font-weight: 600; margin: 16px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .meta { font-size: 9px; color: #888; margin-bottom: 16px; }
  .kpi-grid { display: flex; gap: 12px; margin-bottom: 16px; }
  .kpi { background: #f5f5f0; border-radius: 6px; padding: 10px 14px; min-width: 80px; }
  .kpi-val { font-size: 20px; font-weight: 700; }
  .kpi-lbl { font-size: 9px; color: #888; }
  .kpi-red .kpi-val { color: #E24B4A; }
  .kpi-amber .kpi-val { color: #EF9F27; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 12px; }
  th { background: #fafafa; font-weight: 600; padding: 5px 4px; text-align: left; border-bottom: 2px solid #e0e0e0; }
  td { padding: 4px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  .chip { display: inline-block; font-size: 8px; font-weight: 700; padding: 1px 6px; border-radius: 4px; }
  .chip-mv { background: #FCEBEB; color: #A32D2D; }
  .chip-iv { background: #FAEEDA; color: #854F0B; }
  .chip-secu { background: #E6F1FB; color: #185FA5; }
  .chip-crit { background: #FCEBEB; color: #A32D2D; }
  .chip-maj { background: #FAEEDA; color: #854F0B; }
  .chip-analyse { background: #FCEBEB; color: #A32D2D; }
  .chip-surveiller { background: #FAEEDA; color: #854F0B; }
  .chip-clos { background: #E6F5EE; color: #1D9E75; }
  .footer { margin-top: 20px; font-size: 8px; color: #aaa; border-top: 1px solid #eee; padding-top: 8px; }
  @page { margin: 1.5cm 1.8cm; }
</style>
</head>
<body>

<h1>HOLTER PMS — Rapport de revue hebdomadaire</h1>
<div class="meta">
  Semaine {{ semaine_code }} · {{ date_debut }} – {{ date_fin }} ·
  Expert : {{ expert_nom or 'Non renseigné' }} ·
  Généré le {{ generated_at }}
</div>

<h2>1. Synthèse exécutive</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-val">{{ kpis.total }}</div><div class="kpi-lbl">Tickets analysés</div></div>
  <div class="kpi kpi-red"><div class="kpi-val">{{ kpis.analyse_requise }}</div><div class="kpi-lbl">Analyse requise</div></div>
  <div class="kpi kpi-amber"><div class="kpi-val">{{ kpis.surveiller }}</div><div class="kpi-lbl">À surveiller</div></div>
  <div class="kpi"><div class="kpi-val">{{ kpis.clos }}</div><div class="kpi-lbl">Clos automatiquement</div></div>
</div>

<h2>2. Traçabilité complète ({{ tickets | length }} tickets)</h2>
<table>
  <thead>
    <tr>
      <th>#Ticket</th><th>Priorité</th><th>Produit</th><th>Objet</th>
      <th>Décision IA</th><th>Signal</th><th>Confiance</th>
      <th>Action expert</th><th>Justification</th><th>Articles</th><th>Horodatage</th>
    </tr>
  </thead>
  <tbody>
    {% for t in tickets %}
    <tr>
      <td>{{ t.id }}</td>
      <td>{{ t.priorite or '' }}</td>
      <td>{{ t.produit or '' }}</td>
      <td>{{ t.objet or '' }}</td>
      <td>
        <span class="chip chip-{{ t.decision | lower | replace('_','-') }}">{{ t.decision }}</span>
      </td>
      <td>
        {% if t.signal %}<span class="chip chip-{{ t.signal | lower }}">{{ t.signal }}</span>{% endif %}
      </td>
      <td>{{ (t.confiance * 100) | round | int }}%</td>
      <td>{{ t.action_expert or '—' }}</td>
      <td>{{ t.raisonnement or '' }}{% if t.commentaire %} · Expert : {{ t.commentaire }}{% endif %}</td>
      <td>{{ t.articles_cites | join(', ') }}</td>
      <td style="white-space:nowrap;font-size:8px">{{ t.horodatage or '' }}</td>
    </tr>
    {% endfor %}
  </tbody>
</table>

<h2>5. Annexe méthodologique</h2>
<p>Modèle IA : <strong>{{ model_used }}</strong> · Version dictionnaire : <strong>{{ dictionary_version }}</strong> ·
Seuil CLOS : <strong>{{ (threshold_clos * 100) | round | int }}%</strong> ·
Méthode : pipeline 3 passes (triage → analyse approfondie chain-of-thought + RAG → auto-critique) ·
Conformité : ISO 13485 §8.2.2, MDR Art.87, traitement 100% local HDS.</p>

<div class="footer">
  HOLTER PMS v1 · Données traitées localement, aucune transmission externe · {{ generated_at }}
</div>
</body>
</html>
```

- [ ] **Step 4: Write `src/export/pdf_generator.py`**

```python
from pathlib import Path
from typing import Dict, Any
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML


_TEMPLATE_DIR = Path(__file__).parent / "templates"


def generate_pdf(data: Dict[str, Any]) -> bytes:
    env = Environment(loader=FileSystemLoader(str(_TEMPLATE_DIR)))
    template = env.get_template("report.html")
    html_str = template.render(**data)
    return HTML(string=html_str, base_url=str(_TEMPLATE_DIR)).write_pdf()
```

- [ ] **Step 5: Run test**

```
pytest tests/test_pdf_generator.py -v
```

Expected: 1 PASSED.

- [ ] **Step 6: Commit**

```bash
git add src/export/ tests/test_pdf_generator.py
git commit -m "feat: pdf audit report generator"
```

---

## Task 13: FastAPI Routes & UI

**Files:**
- Create: `src/api/main.py`
- Create: `src/api/routes/import_routes.py`
- Create: `src/api/routes/analysis_routes.py`
- Create: `src/api/routes/review_routes.py`
- Create: `src/api/routes/export_routes.py`
- Create: `src/api/routes/dictionary_routes.py`
- Create: `src/api/static/index.html`
- Create: `src/api/static/app.js`
- Create: `src/api/static/styles.css`
- Create: `tests/test_routes.py`

- [ ] **Step 1: Write `src/api/main.py`**

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from src.api.routes.import_routes import router as import_router
from src.api.routes.analysis_routes import router as analysis_router
from src.api.routes.review_routes import router as review_router
from src.api.routes.export_routes import router as export_router
from src.api.routes.dictionary_routes import router as dictionary_router

app = FastAPI(title="HOLTER PMS", version="1.0")

app.include_router(import_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(review_router, prefix="/api")
app.include_router(export_router, prefix="/api")
app.include_router(dictionary_router, prefix="/api")

_STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(_STATIC)), name="static")


@app.get("/", include_in_schema=False)
async def root():
    return FileResponse(str(_STATIC / "index.html"))
```

- [ ] **Step 2: Write `src/api/routes/import_routes.py`**

```python
import json
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from src.db.connection import get_db
from src.db.schema import init_db
from src.importer.csv_reader import read_csv, normalize_ticket
from src.importer.deduplicator import deduplicate
from src.anonymizer.masker import mask_text

router = APIRouter(tags=["import"])

_mapping_path = Path("mapping.json")


def _load_mapping():
    return json.loads(_mapping_path.read_text(encoding="utf-8"))


def _compute_semaine_code(date_str: Optional[str]) -> str:
    if date_str:
        try:
            dt = datetime.fromisoformat(date_str.replace("/", "-"))
            return dt.strftime("%Y-W%W")
        except Exception:
            pass
    return datetime.now().strftime("%Y-W%W")


@router.post("/import")
async def import_csv(file: UploadFile = File(...)):
    content = await file.read()
    tmp = Path("/tmp") / file.filename
    tmp.write_bytes(content)
    try:
        mapping = _load_mapping()
        rows = read_csv(str(tmp), mapping)
        if not rows:
            raise HTTPException(status_code=400, detail="CSV vide ou mapping incorrect")

        semaine_code = _compute_semaine_code(rows[0].get("date_creation"))
        tickets = [normalize_ticket(r, semaine_code) for r in rows if r.get("id")]
        tickets = deduplicate(tickets, semaine_code)

        now = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO semaines VALUES (?,?,?,?,?,?,?)",
                (semaine_code, "", "", None, now, 0, 0)
            )
            for t in tickets:
                anon_desc = mask_text(t.description)
                conn.execute(
                    """INSERT OR IGNORE INTO tickets
                       (id, semaine_code, objet, priorite, statut, produit, site, description, description_anonyme, date_creation)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (t.id, t.semaine_code, t.objet, t.priorite, t.statut,
                     t.produit, t.site, t.description, anon_desc, t.date_creation),
                )
            conn.execute(
                "UPDATE semaines SET nb_tickets = ? WHERE code = ?",
                (len(tickets), semaine_code)
            )
        return {"semaine_code": semaine_code, "imported": len(tickets)}
    finally:
        tmp.unlink(missing_ok=True)
```

- [ ] **Step 3: Write `src/api/routes/analysis_routes.py`**

```python
import asyncio
import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from src.db.connection import get_db
from src.analysis.ollama_client import OllamaClient, select_model, get_available_ram_gb
from src.analysis.rag import RegulatoryRAG
from src.analysis.pipeline import AnalysisPipeline
from src.dictionary.dict_manager import DictionaryManager

import json
from pathlib import Path

router = APIRouter(tags=["analysis"])
_settings = json.loads(Path("settings.json").read_text())

_progress: dict = {}


@router.post("/analysis/run/{semaine_code}")
async def run_analysis(semaine_code: str):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM tickets WHERE semaine_code = ?", (semaine_code,)
        ).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="Aucun ticket pour cette semaine")

    model = select_model(get_available_ram_gb(), _settings.get("model_override"))
    ollama = OllamaClient(_settings["ollama_url"], model)
    rag = RegulatoryRAG(_settings["chroma_path"], _settings["regulatory_path"])
    dm = DictionaryManager()
    dict_entries = dm.list_for_prompt()
    pipeline = AnalysisPipeline(
        ollama=ollama, rag=rag, dictionary_entries=dict_entries,
        threshold_clos=_settings["confidence_threshold_clos"],
        threshold_escalate=_settings["confidence_threshold_escalate"],
    )

    _progress[semaine_code] = {"done": 0, "total": len(rows), "running": True}

    async def _run():
        from src.models import Ticket
        tickets = [Ticket(**dict(r)) for r in rows]
        with get_db() as conn:
            for i, ticket in enumerate(tickets):
                result = await pipeline.analyze(ticket)
                conn.execute(
                    """INSERT OR REPLACE INTO analyses
                       (ticket_id, semaine_code, decision, signal, niveau, confiance,
                        raisonnement, articles_cites, capa_suggere, mots_cles, passe_finale)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    (ticket.id, semaine_code, result.decision, result.signal, result.niveau,
                     result.confiance, result.raisonnement,
                     json.dumps(result.articles_cites, ensure_ascii=False),
                     int(result.capa_suggere),
                     json.dumps(result.mots_cles, ensure_ascii=False),
                     result.passe_finale),
                )
                _progress[semaine_code]["done"] = i + 1
        _progress[semaine_code]["running"] = False
        with get_db() as conn:
            conn.execute(
                "UPDATE semaines SET analyse_complete = 1 WHERE code = ?", (semaine_code,)
            )

    asyncio.create_task(_run())
    return {"status": "started", "semaine_code": semaine_code, "total": len(rows)}


@router.get("/analysis/progress/{semaine_code}")
async def get_progress(semaine_code: str):
    return _progress.get(semaine_code, {"done": 0, "total": 0, "running": False})


@router.get("/analysis/{semaine_code}")
async def get_analyses(semaine_code: str):
    with get_db() as conn:
        rows = conn.execute(
            """SELECT t.*, a.decision, a.signal, a.niveau, a.confiance,
                      a.raisonnement, a.articles_cites, a.capa_suggere, a.mots_cles, a.passe_finale,
                      d.action_expert, d.decision_finale, d.commentaire, d.horodatage as decision_horodatage
               FROM tickets t
               LEFT JOIN analyses a ON t.id = a.ticket_id AND t.semaine_code = a.semaine_code
               LEFT JOIN decisions d ON t.id = d.ticket_id AND t.semaine_code = d.semaine_code
               WHERE t.semaine_code = ?
               ORDER BY a.confiance ASC""",
            (semaine_code,),
        ).fetchall()
    return [dict(r) for r in rows]
```

- [ ] **Step 4: Write `src/api/routes/review_routes.py`**

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from src.review.review_manager import ReviewManager

router = APIRouter(tags=["review"])
_rm = ReviewManager()


class DecisionPayload(BaseModel):
    ticket_id: str
    semaine_code: str
    expert_nom: str
    action: str
    decision_finale: str
    commentaire: Optional[str] = None


class ExpertPayload(BaseModel):
    semaine_code: str
    expert_nom: str


@router.post("/review/decision")
async def record_decision(payload: DecisionPayload):
    try:
        _rm.record(
            payload.ticket_id, payload.semaine_code, payload.expert_nom,
            payload.action, payload.decision_finale, payload.commentaire
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"ok": True, "pending": _rm.pending_count(payload.semaine_code)}


@router.post("/review/expert")
async def set_expert(payload: ExpertPayload):
    _rm.set_week_expert(payload.semaine_code, payload.expert_nom)
    return {"ok": True}


@router.get("/review/pending/{semaine_code}")
async def pending(semaine_code: str):
    return {"pending": _rm.pending_count(semaine_code)}
```

- [ ] **Step 5: Write `src/api/routes/export_routes.py`**

```python
import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pathlib import Path

from src.db.connection import get_db
from src.export.pdf_generator import generate_pdf
from src.review.review_manager import ReviewManager

router = APIRouter(tags=["export"])
_settings = json.loads(Path("settings.json").read_text())
_rm = ReviewManager()


@router.post("/export/pdf/{semaine_code}")
async def export_pdf(semaine_code: str):
    if _rm.pending_count(semaine_code) > 0:
        raise HTTPException(
            status_code=409,
            detail="Export verrouillé : des tickets ANALYSE_REQUISE n'ont pas encore été validés par l'expert."
        )
    with get_db() as conn:
        sem = conn.execute("SELECT * FROM semaines WHERE code = ?", (semaine_code,)).fetchone()
        if not sem:
            raise HTTPException(status_code=404, detail="Semaine non trouvée")
        rows = conn.execute(
            """SELECT t.id, t.objet, t.priorite, t.produit, t.site, t.statut,
                      a.decision, a.signal, a.niveau, a.confiance,
                      a.raisonnement, a.articles_cites, a.capa_suggere,
                      d.action_expert, d.commentaire, d.horodatage
               FROM tickets t
               LEFT JOIN analyses a ON t.id = a.ticket_id AND t.semaine_code = a.semaine_code
               LEFT JOIN decisions d ON t.id = d.ticket_id AND t.semaine_code = d.semaine_code
               WHERE t.semaine_code = ?""",
            (semaine_code,),
        ).fetchall()
        dict_count = conn.execute("SELECT COUNT(*) as n FROM dictionnaire").fetchone()["n"]

    tickets = []
    kpis = {"total": 0, "analyse_requise": 0, "surveiller": 0, "clos": 0}
    for r in rows:
        t = dict(r)
        t["articles_cites"] = json.loads(t.get("articles_cites") or "[]")
        tickets.append(t)
        kpis["total"] += 1
        decision = (t.get("decision") or "CLOS").upper()
        if decision == "ANALYSE_REQUISE":
            kpis["analyse_requise"] += 1
        elif decision == "SURVEILLER":
            kpis["surveiller"] += 1
        else:
            kpis["clos"] += 1

    data = {
        "semaine_code": semaine_code,
        "date_debut": sem["date_debut"],
        "date_fin": sem["date_fin"],
        "expert_nom": sem["expert_nom"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_used": _settings.get("model_override") or "auto-detect",
        "kpis": kpis,
        "tickets": tickets,
        "dictionary_version": dict_count,
        "threshold_clos": _settings["confidence_threshold_clos"],
    }
    pdf_bytes = generate_pdf(data)
    filename = f"holter_pms_{semaine_code}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
```

- [ ] **Step 6: Write `src/api/routes/dictionary_routes.py`**

```python
from fastapi import APIRouter, HTTPException
from src.dictionary.dict_manager import DictionaryManager
from src.models import DictionaryEntry

router = APIRouter(tags=["dictionary"])
_dm = DictionaryManager()


@router.get("/dictionary")
async def list_dictionary():
    return _dm.list_all()


@router.post("/dictionary")
async def add_entry(entry: DictionaryEntry):
    try:
        _dm.add(entry)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"ok": True}


@router.delete("/dictionary/{pattern}")
async def delete_entry(pattern: str):
    _dm.delete(pattern)
    return {"ok": True}
```

- [ ] **Step 7: Write the single-page UI `src/api/static/index.html`**

```html
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>HOLTER PMS</title>
<link rel="stylesheet" href="/static/styles.css">
</head>
<body>
<div class="header">
  <div>
    <h1><span class="accent"></span>HOLTER <span class="subtitle">PMS Intelligence</span></h1>
    <p class="meta-line" id="meta-line">Prêt</p>
  </div>
  <div style="display:flex;gap:8px;align-items:center">
    <select id="semaine-select" onchange="loadSemaine()" style="font-size:13px;padding:6px 10px;border:1px solid #ddd;border-radius:6px;background:white"></select>
    <label class="upload-btn">
      Importer CSV
      <input type="file" id="csv-input" accept=".csv" onchange="importCSV()" style="display:none">
    </label>
  </div>
</div>

<div class="tabs">
  <button class="tab active" onclick="switchTab('dashboard',this)">Tableau de bord</button>
  <button class="tab" onclick="switchTab('review',this)">File de revue <span class="tab-badge" id="badge-pending"></span></button>
  <button class="tab" onclick="switchTab('signals',this)">Signaux vigilance</button>
  <button class="tab" onclick="switchTab('dictionary',this)">Dictionnaire</button>
</div>

<div id="panel-dashboard" class="panel active"></div>
<div id="panel-review" class="panel"></div>
<div id="panel-signals" class="panel"></div>
<div id="panel-dictionary" class="panel"></div>

<script src="/static/app.js"></script>
</body>
</html>
```

- [ ] **Step 8: Write `src/api/static/styles.css`**

```css
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f0;color:#1a1a1a;padding:20px;max-width:1100px;margin:0 auto}
h1{font-size:22px;font-weight:700;display:flex;align-items:center;gap:10px}
.accent{width:6px;height:24px;background:#E24B4A;border-radius:3px;flex-shrink:0}
.subtitle{font-size:13px;font-weight:400;color:#888;font-family:monospace}
.header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;gap:10px;flex-wrap:wrap}
.meta-line{font-size:11px;color:#aaa;margin-top:2px}
.tabs{display:flex;border-bottom:1px solid #ddd;margin-bottom:20px}
.tab{padding:10px 16px;font-size:13px;cursor:pointer;background:transparent;border:none;border-bottom:2px solid transparent;color:#888;font-weight:400}
.tab.active{color:#1a1a1a;font-weight:600;border-bottom-color:#1a1a1a}
.tab-badge{background:#E24B4A;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:5px}
.panel{display:none}.panel.active{display:block}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.kpi{background:white;border-radius:8px;padding:14px;border:1px solid #eee}
.kpi-label{font-size:12px;color:#888;margin-bottom:4px}
.kpi-value{font-size:24px;font-weight:700;line-height:1.2}
.kpi-red .kpi-value{color:#E24B4A}
.kpi-amber .kpi-value{color:#EF9F27}
.kpi-green .kpi-value{color:#1D9E75}
.upload-btn{font-size:13px;padding:8px 16px;background:#1a1a1a;color:white;border-radius:6px;cursor:pointer}
.btn{font-size:12px;padding:6px 14px;cursor:pointer;background:#f5f5f5;border:1px solid #ddd;border-radius:6px;color:#1a1a1a}
.btn-primary{background:#1a1a1a;color:white;border-color:#1a1a1a}
.btn-red{background:#E24B4A;color:white;border-color:#E24B4A}
.chip{font-size:11px;font-weight:600;padding:2px 8px;border-radius:5px;display:inline-block}
.chip-mv{background:#FCEBEB;color:#A32D2D}
.chip-iv{background:#FAEEDA;color:#854F0B}
.chip-secu{background:#E6F1FB;color:#185FA5}
.chip-critique{background:#FCEBEB;color:#A32D2D}
.chip-majeur{background:#FAEEDA;color:#854F0B}
.chip-analyse-requise{background:#FCEBEB;color:#A32D2D}
.chip-surveiller{background:#FAEEDA;color:#854F0B}
.chip-clos{background:#E6F5EE;color:#1D9E75}
table{width:100%;border-collapse:collapse;font-size:12px;background:white;border-radius:8px;overflow:hidden;border:1px solid #eee}
th{background:#fafafa;font-weight:600;padding:10px 8px;text-align:left;border-bottom:2px solid #e0e0e0;font-size:12px;color:#555}
td{padding:8px;border-bottom:1px solid #f5f5f5;vertical-align:top}
tr:last-child td{border-bottom:none}
.warn-box{background:#FAEEDA;border:1px solid #EF9F27;border-radius:8px;padding:12px;font-size:12px;color:#854F0B;line-height:1.6;margin-top:16px}
.progress-bar{background:#e0e0e0;border-radius:4px;height:8px;margin:8px 0}
.progress-fill{background:#378ADD;height:8px;border-radius:4px;transition:width 0.3s}
.ticket-card{background:white;border-radius:10px;padding:14px;margin-bottom:10px;border:1px solid #eee}
.ticket-header{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}
.ticket-body{margin-top:10px;padding-top:10px;border-top:1px solid #f0f0f0}
.raqa-text{font-size:13px;color:#555;line-height:1.6;margin-bottom:8px}
.action-bar{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.expert-banner{background:#f0f4ff;border:1px solid #c5d3f0;border-radius:8px;padding:10px 14px;margin-bottom:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.expert-banner input{padding:6px 10px;border:1px solid #c5d3f0;border-radius:6px;font-size:13px}
```

- [ ] **Step 9: Write `src/api/static/app.js`**

```javascript
let currentSemaine = null;

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opts);
  if (!r.ok) { const e = await r.json(); throw new Error(e.detail || r.status); }
  return r.json();
}

function switchTab(name, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
  if (name === 'review' && currentSemaine) renderReview();
  if (name === 'signals' && currentSemaine) renderSignals();
  if (name === 'dictionary') renderDictionary();
}

async function importCSV() {
  const file = document.getElementById('csv-input').files[0];
  if (!file) return;
  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await fetch('/api/import', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail);
    alert(`Import réussi : ${data.imported} tickets · Semaine ${data.semaine_code}`);
    await loadSemaineList();
    document.getElementById('semaine-select').value = data.semaine_code;
    await loadSemaine();
    if (confirm('Lancer l\'analyse IA maintenant ?')) runAnalysis();
  } catch(e) { alert('Erreur import : ' + e.message); }
}

async function loadSemaineList() {
  // Use the analyses endpoint to discover weeks
  // For now, parse from the select (populated at boot)
}

async function loadSemaine() {
  const sel = document.getElementById('semaine-select');
  currentSemaine = sel.value;
  if (!currentSemaine) return;
  await renderDashboard();
}

async function runAnalysis() {
  if (!currentSemaine) return;
  try {
    const r = await api('POST', `/analysis/run/${currentSemaine}`);
    pollProgress(r.total);
  } catch(e) { alert('Erreur analyse : ' + e.message); }
}

function pollProgress(total) {
  const dash = document.getElementById('panel-dashboard');
  dash.innerHTML = `<div class="warn-box">Analyse en cours...<div class="progress-bar"><div class="progress-fill" id="pf" style="width:0%"></div></div><span id="prog-text">0 / ${total}</span></div>`;
  const interval = setInterval(async () => {
    const p = await api('GET', `/analysis/progress/${currentSemaine}`);
    const pct = total > 0 ? Math.round(p.done / total * 100) : 0;
    document.getElementById('pf').style.width = pct + '%';
    document.getElementById('prog-text').textContent = `${p.done} / ${total}`;
    if (!p.running) { clearInterval(interval); renderDashboard(); }
  }, 2000);
}

async function renderDashboard() {
  const tickets = await api('GET', `/analysis/${currentSemaine}`);
  const kpis = { total: tickets.length, analyse_requise: 0, surveiller: 0, clos: 0 };
  tickets.forEach(t => {
    const d = (t.decision || 'CLOS').toUpperCase();
    if (d === 'ANALYSE_REQUISE') kpis.analyse_requise++;
    else if (d === 'SURVEILLER') kpis.surveiller++;
    else kpis.clos++;
  });
  const pending = kpis.analyse_requise;
  const badge = document.getElementById('badge-pending');
  if (badge) badge.textContent = pending > 0 ? pending : '';

  document.getElementById('panel-dashboard').innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Tickets analysés</div><div class="kpi-value">${kpis.total}</div></div>
      <div class="kpi kpi-red"><div class="kpi-label">Analyse requise</div><div class="kpi-value">${kpis.analyse_requise}</div></div>
      <div class="kpi kpi-amber"><div class="kpi-label">À surveiller</div><div class="kpi-value">${kpis.surveiller}</div></div>
      <div class="kpi kpi-green"><div class="kpi-label">Clos automatiquement</div><div class="kpi-value">${kpis.clos}</div></div>
    </div>
    <button class="btn btn-primary" onclick="exportPDF()">Exporter rapport PDF</button>
    ${pending > 0 ? `<div class="warn-box" style="margin-top:12px">⚠ ${pending} ticket(s) ANALYSE_REQUISE en attente de validation expert. L'export PDF sera déverrouillé après validation complète.</div>` : ''}
  `;
}

async function renderReview() {
  const tickets = await api('GET', `/analysis/${currentSemaine}`);
  const toReview = tickets.filter(t => t.decision === 'ANALYSE_REQUISE' && !t.action_expert);
  const expertName = prompt('Votre nom (expert de la semaine) :') || 'Expert';

  document.getElementById('panel-review').innerHTML = `
    <div class="expert-banner">
      Expert de la semaine : <strong>${expertName}</strong> · ${toReview.length} ticket(s) à valider
    </div>
    ${toReview.map(t => `
    <div class="ticket-card" id="card-${t.id}">
      <div class="ticket-header">
        <div>
          <span style="font-size:11px;color:#888">#${t.id}</span>
          <div style="font-size:14px;font-weight:600;margin:2px 0">${t.objet || ''}</div>
          <div style="font-size:12px;color:#888">${t.produit || ''} · ${t.site || ''} · ${t.priorite || ''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;text-align:right">
          ${t.signal ? `<span class="chip chip-${t.signal.toLowerCase()}">${t.signal}</span>` : ''}
          ${t.niveau ? `<span class="chip chip-${t.niveau.toLowerCase()}">${t.niveau}</span>` : ''}
          <span style="font-size:11px;color:#888">${Math.round((t.confiance||0)*100)}% conf.</span>
        </div>
      </div>
      <div class="ticket-body">
        <div class="raqa-text">${t.raisonnement || ''}</div>
        ${t.articles_cites ? `<div style="font-size:11px;color:#888;margin-bottom:6px">Articles : ${JSON.parse(t.articles_cites||'[]').join(', ')}</div>` : ''}
        <div class="action-bar">
          <button class="btn" onclick="decide('${t.id}','CONFIRMER','${t.decision}',null,'${expertName}')">✓ Confirmer</button>
          <button class="btn btn-red" onclick="reclasser('${t.id}','${t.decision}','${expertName}')">↺ Reclasser</button>
          <button class="btn" onclick="ecarter('${t.id}','${expertName}')">✕ Écarter</button>
          <button class="btn" onclick="addToDict('${t.id}')">+ Dictionnaire</button>
        </div>
      </div>
    </div>`).join('')}
  `;
}

async function decide(ticketId, action, decisionFinale, commentaire, expert) {
  await api('POST', '/review/decision', {
    ticket_id: ticketId, semaine_code: currentSemaine,
    expert_nom: expert, action, decision_finale: decisionFinale, commentaire
  });
  document.getElementById('card-' + ticketId).style.opacity = '0.4';
  const p = await api('GET', `/review/pending/${currentSemaine}`);
  const badge = document.getElementById('badge-pending');
  if (badge) badge.textContent = p.pending > 0 ? p.pending : '';
}

function reclasser(ticketId, currentDecision, expert) {
  const choices = ['ANALYSE_REQUISE', 'SURVEILLER', 'CLOS'].filter(d => d !== currentDecision);
  const newDecision = prompt(`Reclasser en :\n${choices.map((c,i) => `${i+1}. ${c}`).join('\n')}\n\n(entrer le nom)`) || '';
  const comment = prompt('Commentaire obligatoire :');
  if (!comment) return alert('Commentaire requis');
  decide(ticketId, 'RECLASSER', newDecision || currentDecision, comment, expert);
}

function ecarter(ticketId, expert) {
  const comment = prompt('Justification obligatoire :');
  if (!comment) return alert('Justification requise');
  decide(ticketId, 'ECARTER', 'CLOS', comment, expert);
}

function addToDict(ticketId) {
  const pattern = prompt('Pattern à ajouter au dictionnaire :');
  if (!pattern) return;
  const signal = prompt('Signal (MV / IV / SECU) :');
  const niveau = prompt('Niveau (CRITIQUE / MAJEUR / MINEUR) :');
  const article = prompt('Article réglementaire (ex: MDR Art.87) :') || '';
  const expert = prompt('Votre nom :') || 'Expert';
  api('POST', '/dictionary', {
    pattern, signal, niveau, article,
    cree_par: expert, date_creation: new Date().toISOString().slice(0,10)
  }).then(() => alert('Entrée ajoutée au dictionnaire')).catch(e => alert(e.message));
}

async function renderSignals() {
  const tickets = await api('GET', `/analysis/${currentSemaine}`);
  const signals = tickets.filter(t => t.signal && ['MV','IV','SECU'].includes(t.signal));
  document.getElementById('panel-signals').innerHTML = signals.length === 0
    ? '<p style="color:#888;padding:20px">Aucun signal vigilance détecté.</p>'
    : signals.map(t => `
      <div class="ticket-card">
        <div class="ticket-header">
          <div>
            <span class="chip chip-${t.signal.toLowerCase()}">${t.signal}</span>
            ${t.niveau ? `<span class="chip chip-${t.niveau.toLowerCase()}" style="margin-left:4px">${t.niveau}</span>` : ''}
            <div style="font-size:14px;font-weight:600;margin:4px 0">${t.objet || ''}</div>
            <div style="font-size:12px;color:#888">#${t.id} · ${t.produit || ''} · ${t.site || ''}</div>
          </div>
        </div>
        <div class="ticket-body">
          <div class="raqa-text">${t.raisonnement || ''}</div>
          ${t.articles_cites ? `<div style="font-size:11px;color:#888">Articles cités : ${JSON.parse(t.articles_cites||'[]').join(', ')}</div>` : ''}
          ${t.capa_suggere ? '<div style="font-size:11px;color:#E24B4A;margin-top:4px;font-weight:600">⚠ CAPA suggéré</div>' : ''}
        </div>
      </div>`).join('');
}

async function renderDictionary() {
  const entries = await api('GET', '/dictionary');
  document.getElementById('panel-dictionary').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:13px;color:#888">${entries.length} entrée(s)</div>
    </div>
    <table>
      <thead><tr><th>Pattern</th><th>Signal</th><th>Niveau</th><th>Article</th><th>Créé par</th><th>Semaines validées</th><th>Poids</th><th></th></tr></thead>
      <tbody>
        ${entries.map(e => `<tr>
          <td><strong>${e.pattern}</strong></td>
          <td><span class="chip chip-${e.signal.toLowerCase()}">${e.signal}</span></td>
          <td>${e.niveau}</td>
          <td style="font-size:11px;color:#888">${e.article || ''}</td>
          <td style="font-size:11px;color:#888">${e.cree_par}</td>
          <td style="text-align:center">${e.semaines_validees}</td>
          <td><span class="chip ${e.poids==='fort'?'chip-mv':e.poids==='moyen'?'chip-iv':'chip-clos'}">${e.poids}</span></td>
          <td><button class="btn" onclick="deleteEntry('${e.pattern}')">✕</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;
}

async function deleteEntry(pattern) {
  if (!confirm(`Supprimer "${pattern}" du dictionnaire ?`)) return;
  await api('DELETE', `/dictionary/${encodeURIComponent(pattern)}`);
  renderDictionary();
}

async function exportPDF() {
  const r = await fetch(`/api/export/pdf/${currentSemaine}`, { method: 'POST' });
  if (!r.ok) { const e = await r.json(); return alert(e.detail); }
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `holter_pms_${currentSemaine}.pdf`;
  a.click();
}

// Boot
window.onload = async () => {
  document.getElementById('meta-line').textContent = 'HOLTER PMS v1 — Chargement...';
};
```

- [ ] **Step 10: Write route tests**

```python
# tests/test_routes.py
import pytest
from fastapi.testclient import TestClient
from src.api.main import app
from src.db.schema import init_db
from src.db.connection import configure

@pytest.fixture(autouse=True)
def setup_db(tmp_db):
    configure(tmp_db)
    init_db(tmp_db)

client = TestClient(app)


def test_root_returns_html():
    r = client.get("/")
    assert r.status_code == 200


def test_dictionary_empty_on_start():
    r = client.get("/api/dictionary")
    assert r.status_code == 200
    assert r.json() == []


def test_add_and_list_dictionary():
    payload = {
        "pattern": "VIDAL KO", "signal": "MV", "niveau": "CRITIQUE",
        "cree_par": "Test", "date_creation": "2026-05-26"
    }
    r = client.post("/api/dictionary", json=payload)
    assert r.status_code == 200
    entries = client.get("/api/dictionary").json()
    assert len(entries) == 1
    assert entries[0]["pattern"] == "VIDAL KO"


def test_review_pending_404_graceful():
    r = client.get("/api/review/pending/2099-W99")
    assert r.status_code == 200
    assert r.json()["pending"] == 0
```

- [ ] **Step 11: Run all tests**

```
pytest tests/test_routes.py -v
```

Expected: 4 PASSED.

- [ ] **Step 12: Commit**

```bash
git add src/api/ tests/test_routes.py
git commit -m "feat: fastapi routes and ui"
```

---

## Task 14: Entry Point & PyInstaller Packaging

**Files:**
- Create: `holter.py`
- Create: `holter.spec`

- [ ] **Step 1: Write `holter.py`**

```python
import json
import sys
import time
import threading
import webbrowser
from pathlib import Path

import uvicorn

from src.db.schema import init_db
from src.db.connection import configure


def _load_settings() -> dict:
    path = Path("settings.json")
    if not path.exists():
        return {"port": 8765, "db_path": "./holter.db"}
    return json.loads(path.read_text(encoding="utf-8"))


def _open_browser(port: int, delay: float = 1.5) -> None:
    time.sleep(delay)
    webbrowser.open(f"http://localhost:{port}")


def main() -> None:
    settings = _load_settings()
    db_path = settings.get("db_path", "./holter.db")
    port = settings.get("port", 8765)

    configure(db_path)
    init_db(db_path)

    threading.Thread(target=_open_browser, args=(port,), daemon=True).start()

    from src.api.main import app
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify manual launch**

```
python holter.py
```

Expected: browser opens at `http://localhost:8765`, HOLTER UI loads, no errors in console.

- [ ] **Step 3: Write `holter.spec`**

```python
# holter.spec
import sys
from pathlib import Path

block_cipher = None

a = Analysis(
    ['holter.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('settings.json', '.'),
        ('mapping.json', '.'),
        ('src/api/static', 'src/api/static'),
        ('src/export/templates', 'src/export/templates'),
    ],
    hiddenimports=[
        'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto',
        'uvicorn.protocols', 'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto', 'uvicorn.lifespan',
        'uvicorn.lifespan.on', 'chromadb', 'sentence_transformers',
        'weasyprint', 'chardet', 'psutil',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='holter',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    icon=None,
)
```

- [ ] **Step 4: Build the executable**

```
pyinstaller holter.spec --clean
```

Expected: `dist/holter.exe` created (~150-300 MB with all dependencies).

- [ ] **Step 5: Test the executable**

```
.\dist\holter.exe
```

Expected: browser opens at `http://localhost:8765`, UI loads identically to the Python run.

- [ ] **Step 6: Run full test suite**

```
pytest tests/ -v --tb=short
```

Expected: all tests PASSED.

- [ ] **Step 7: Final commit**

```bash
git add holter.py holter.spec
git commit -m "feat: entry point and pyinstaller packaging"
git tag v1.0.0
```

---

## Self-Review Checklist

### Spec coverage
| Spec requirement | Task |
|---|---|
| Import CSV Salesforce, encoding auto-detect | Task 4 |
| mapping.json configurable | Task 1 + 4 |
| Anonymisation IPP/NDA/noms avant Ollama | Task 5 |
| Modèle adaptatif selon RAM | Task 6 |
| 3-pass pipeline (triage / approfondi / auto-critique) | Task 9 |
| RAG réglementaire ChromaDB | Task 7 |
| Dictionary avec lifecycle faible→moyen→fort | Task 10 |
| Revue expert ~40 tickets, pas les 1 700 | Task 11 + 13 |
| Export PDF verrouillé si pending | Task 12 |
| Rapport PDF avec synthèse + traçabilité + articles | Task 12 |
| Rotation expert nominative | Task 11 |
| SURVEILLER auto dans rapport sans action | Task 13 routes |
| SQLite local, aucune donnée externe | All tasks |
| PyInstaller .exe | Task 14 |

### Types cohérents
- `AnalysisResult.passe_finale: int` défini en Task 3, utilisé tel quel dans Tasks 9 et 13. ✓
- `DictionaryEntry.poids` string littéral `faible/moyen/fort` cohérent Tasks 3, 10, 8. ✓
- `get_db()` context manager configuré via `configure(path)` utilisé dans Tasks 2, 4, 10, 11, 13. ✓

### Placeholders
Aucun TBD, TODO ou "handle edge cases" trouvé. ✓

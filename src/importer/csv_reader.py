import csv
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

import csv
from pathlib import Path
from typing import List, Dict, Any
import chardet
from src.models import Ticket


def read_csv(path: str, mapping: Dict[str, str]) -> List[Dict[str, Any]]:
    file_path = Path(path)
    if file_path.suffix.lower() == ".xlsx":
        return _read_xlsx(file_path, mapping)
    return _read_csv(file_path, mapping)


def _read_csv(file_path: Path, mapping: Dict[str, str]) -> List[Dict[str, Any]]:
    raw_bytes = file_path.read_bytes()
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


def _find_header_row(ws) -> int:
    """Return 1-based row index of first row with ≥ 5 non-null cells."""
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=50, values_only=True), start=1):
        if sum(1 for v in row if v is not None) >= 5:
            return i
    return 1


def _read_xlsx(file_path: Path, mapping: Dict[str, str]) -> List[Dict[str, Any]]:
    import openpyxl
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    ws = wb.active

    header_row_idx = _find_header_row(ws)
    headers = []
    for row in ws.iter_rows(min_row=header_row_idx, max_row=header_row_idx, values_only=True):
        headers = [str(v).strip() if v is not None else "" for v in row]

    id_column = mapping.get("id", "")
    seen_ids: set = set()
    rows = []

    for row in ws.iter_rows(min_row=header_row_idx + 1, values_only=True):
        raw_row = {headers[i]: (str(v).strip() if v is not None else "") for i, v in enumerate(row) if i < len(headers)}

        # Salesforce exports repeat rows per comment — deduplicate by ticket ID
        ticket_id = raw_row.get(id_column, "")
        if not ticket_id or ticket_id in seen_ids:
            continue
        seen_ids.add(ticket_id)

        normalized = {}
        for internal_key, sf_column in mapping.items():
            normalized[internal_key] = raw_row.get(sf_column, "")
        rows.append(normalized)

    wb.close()
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

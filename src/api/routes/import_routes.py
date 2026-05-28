import json
from collections import Counter
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException
import tempfile

from src.db.connection import get_db
from src.importer.csv_reader import read_csv, normalize_ticket
from src.importer.deduplicator import deduplicate
from src.anonymizer.masker import mask_text
from src.config import get_settings, _base_dir

router = APIRouter(tags=["import"])


def _load_mapping() -> dict:
    path = _base_dir() / "mapping.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _compute_semaine_code(date_str: Optional[str]) -> str:
    if date_str:
        try:
            dt = datetime.fromisoformat(date_str.replace("/", "-").split("T")[0])
            return dt.strftime("%Y-W%W")
        except Exception:
            pass
    return datetime.now().strftime("%Y-W%W")


@router.post("/import")
async def import_file(file: UploadFile = File(...)):
    content = await file.read()

    original_name = file.filename or "upload.csv"
    suffix = Path(original_name).suffix.lower() or ".csv"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    try:
        mapping = _load_mapping()
        rows = read_csv(tmp_path, mapping)
        if not rows:
            raise HTTPException(status_code=400, detail="Fichier vide ou mapping incorrect")

        # Semaine majoritaire parmi tous les tickets (évite que le 1er ticket
        # dicte la semaine si le CSV en contient plusieurs ou si sa date est vide)
        all_codes = [_compute_semaine_code(r.get("date_creation")) for r in rows]
        semaine_code = Counter(all_codes).most_common(1)[0][0]
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
                       (id, semaine_code, objet, priorite, statut, produit, site,
                        description, description_anonyme, date_creation)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (t.id, t.semaine_code, t.objet, t.priorite, t.statut,
                     t.produit, t.site, t.description, anon_desc, t.date_creation),
                )
            conn.execute(
                "UPDATE semaines SET nb_tickets = ? WHERE code = ?",
                (len(tickets), semaine_code)
            )
        return {"semaine_code": semaine_code, "imported": len(tickets)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        Path(tmp_path).unlink(missing_ok=True)

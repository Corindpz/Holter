import asyncio
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException

from src.db.connection import get_db
from src.analysis.ollama_client import OllamaClient, select_model, get_available_ram_gb
from src.analysis.rag import RegulatoryRAG
from src.analysis.pipeline import AnalysisPipeline
from src.dictionary.dict_manager import DictionaryManager
from src.models import Ticket

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
    pipeline = AnalysisPipeline(
        ollama=ollama, rag=rag, dictionary_entries=dm.list_for_prompt(),
        threshold_clos=_settings["confidence_threshold_clos"],
        threshold_escalate=_settings["confidence_threshold_escalate"],
    )

    _progress[semaine_code] = {"done": 0, "total": len(rows), "running": True}

    async def _run():
        tickets = [Ticket(**dict(r)) for r in rows]
        for i, ticket in enumerate(tickets):
            result = await pipeline.analyze(ticket)
            with get_db() as conn:
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
                      d.action_expert, d.decision_finale, d.commentaire,
                      d.horodatage as decision_horodatage
               FROM tickets t
               LEFT JOIN analyses a ON t.id = a.ticket_id AND t.semaine_code = a.semaine_code
               LEFT JOIN decisions d ON t.id = d.ticket_id AND t.semaine_code = d.semaine_code
               WHERE t.semaine_code = ?
               ORDER BY a.confiance ASC""",
            (semaine_code,),
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/semaines")
async def list_semaines():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM semaines ORDER BY code DESC").fetchall()
    return [dict(r) for r in rows]

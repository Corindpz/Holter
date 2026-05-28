import asyncio
import json
from fastapi import APIRouter, HTTPException

from src.db.connection import get_db
from src.analysis.ollama_client import OllamaClient, select_model, get_available_ram_gb
from src.analysis.rag import RegulatoryRAG
from src.analysis.pipeline import AnalysisPipeline
from src.dictionary.dict_manager import DictionaryManager
from src.models import Ticket, ExclusionRule
from src.config import get_settings

router = APIRouter(tags=["analysis"])
_progress: dict = {}


@router.post("/analysis/run/{semaine_code}")
async def run_analysis(semaine_code: str):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM tickets WHERE semaine_code = ?", (semaine_code,)
        ).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="Aucun ticket pour cette semaine")

    settings = get_settings()
    model = select_model(get_available_ram_gb(), settings.get("model_override"))
    ollama = OllamaClient(settings["ollama_url"], model)
    rag = RegulatoryRAG(settings["chroma_path"], settings["regulatory_path"])
    dm = DictionaryManager()
    with get_db() as conn:
        excl_rows = conn.execute("SELECT * FROM exclusions WHERE actif = 1").fetchall()
    exclusion_rules = [ExclusionRule(**dict(r)) for r in excl_rows]
    pipeline = AnalysisPipeline(
        ollama=ollama, rag=rag, dictionary_entries=dm.list_for_prompt(),
        exclusion_rules=exclusion_rules,
        threshold_clos=settings["confidence_threshold_clos"],
        threshold_escalate=settings["confidence_threshold_escalate"],
    )

    concurrency = int(settings.get("analysis_concurrency", 6))
    _progress[semaine_code] = {"done": 0, "total": len(rows), "running": True, "errors": 0}

    async def _run():
        tickets = [Ticket(**dict(r)) for r in rows]
        sem = asyncio.Semaphore(concurrency)
        db_lock = asyncio.Lock()

        async def _process(ticket: Ticket) -> None:
            async with sem:
                try:
                    result = await pipeline.analyze(ticket)
                except Exception as exc:
                    # Ticket stays without analysis rather than crashing the whole batch
                    _progress[semaine_code]["errors"] += 1
                    return

            async with db_lock:
                with get_db() as conn:
                    conn.execute(
                        """INSERT OR REPLACE INTO analyses
                           (ticket_id, semaine_code, decision, signal, niveau, confiance,
                            raisonnement, articles_cites, capa_suggere, capa_justification,
                            mots_cles, passe_finale)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (ticket.id, semaine_code, result.decision, result.signal, result.niveau,
                         result.confiance, result.raisonnement,
                         json.dumps(result.articles_cites, ensure_ascii=False),
                         int(result.capa_suggere),
                         result.capa_justification,
                         json.dumps(result.mots_cles, ensure_ascii=False),
                         result.passe_finale),
                    )
                _progress[semaine_code]["done"] += 1

        await asyncio.gather(*[_process(t) for t in tickets])

        _progress[semaine_code]["running"] = False
        with get_db() as conn:
            conn.execute(
                "UPDATE semaines SET analyse_complete = 1 WHERE code = ?", (semaine_code,)
            )

    asyncio.create_task(_run())
    return {"status": "started", "semaine_code": semaine_code, "total": len(rows), "concurrency": concurrency}


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
    from src.models import Semaine as SemaineModel
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM semaines ORDER BY code DESC").fetchall()
    return [SemaineModel(**dict(r)).model_dump() for r in rows]

import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from src.db.connection import get_db
from src.analytics.trend_engine import get_trend_series, get_top_clusters
from src.analytics.priority_engine import generate_priorities
from src.analysis.ollama_client import OllamaClient, select_model, get_available_ram_gb
from src.config import get_settings

router = APIRouter(tags=["analytics"])


@router.get("/analytics/trends/{semaine_code}")
async def get_trends(semaine_code: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT code FROM semaines WHERE code = ?", (semaine_code,)
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Semaine introuvable")
    return get_trend_series(semaine_code)


@router.post("/analytics/priorities/{semaine_code}")
async def generate_priority_recommendations(semaine_code: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT analyse_complete, nb_tickets FROM semaines WHERE code = ?",
            (semaine_code,),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Semaine introuvable")
    if not row["analyse_complete"]:
        raise HTTPException(
            status_code=404,
            detail="L'analyse IA n'est pas encore complète pour cette semaine",
        )
    settings = get_settings()
    model = select_model(get_available_ram_gb(), settings.get("model_override"))
    ollama = OllamaClient(settings["ollama_url"], model)
    if not await ollama.health_check():
        raise HTTPException(
            status_code=503,
            detail="Ollama indisponible — vérifiez que le service IA est démarré",
        )
    clusters = get_top_clusters(semaine_code)
    recommendations = await generate_priorities(
        clusters, semaine_code, row["nb_tickets"], ollama
    )
    generated_at = datetime.now().isoformat()
    recs_json = json.dumps([r.model_dump() for r in recommendations], ensure_ascii=False)
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO priorites (semaine_code, generated_at, recommendations) VALUES (?,?,?)",
            (semaine_code, generated_at, recs_json),
        )
    return {"generated_at": generated_at, "recommendations": [r.model_dump() for r in recommendations]}


@router.get("/analytics/priorities/{semaine_code}")
async def get_priority_recommendations(semaine_code: str):
    with get_db() as conn:
        row = conn.execute(
            "SELECT recommendations, generated_at FROM priorites WHERE semaine_code = ?",
            (semaine_code,),
        ).fetchone()
    if not row:
        raise HTTPException(
            status_code=404,
            detail="Aucune recommandation générée pour cette semaine",
        )
    return {
        "generated_at": row["generated_at"],
        "recommendations": json.loads(row["recommendations"]),
    }

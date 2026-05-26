import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from src.db.connection import get_db
from src.export.pdf_generator import generate_pdf
from src.review.review_manager import ReviewManager
from src.config import get_settings

router = APIRouter(tags=["export"])
_rm = ReviewManager()


@router.post("/export/pdf/{semaine_code}")
async def export_pdf(semaine_code: str):
    if _rm.pending_count(semaine_code) > 0:
        raise HTTPException(
            status_code=409,
            detail="Export verrouillé : des tickets ANALYSE_REQUISE n'ont pas encore été validés."
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
        raw_articles = t.get("articles_cites")
        t["articles_cites"] = json.loads(raw_articles) if raw_articles else []
        tickets.append(t)
        kpis["total"] += 1
        dec = (t.get("decision") or "CLOS").upper()
        if dec == "ANALYSE_REQUISE":
            kpis["analyse_requise"] += 1
        elif dec == "SURVEILLER":
            kpis["surveiller"] += 1
        else:
            kpis["clos"] += 1

    settings = get_settings()
    data = {
        "semaine_code": semaine_code,
        "date_debut": sem["date_debut"],
        "date_fin": sem["date_fin"],
        "expert_nom": sem["expert_nom"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model_used": settings.get("model_override") or "auto-detect",
        "kpis": kpis,
        "tickets": tickets,
        "dictionary_version": dict_count,
        "threshold_clos": settings["confidence_threshold_clos"],
    }
    pdf_bytes = generate_pdf(data)
    filename = f"holter_pms_{semaine_code}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

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

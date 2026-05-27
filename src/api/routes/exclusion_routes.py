from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from src.db.connection import get_db

router = APIRouter(tags=["exclusions"])


class ExclusionIn(BaseModel):
    champ: str
    operateur: str
    valeur: str
    raison: str
    cree_par: str


@router.get("/exclusions")
def list_exclusions():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM exclusions ORDER BY id DESC").fetchall()
    return [dict(r) for r in rows]


@router.post("/exclusions", status_code=201)
def add_exclusion(body: ExclusionIn):
    if body.champ not in ("site", "produit", "objet", "type"):
        raise HTTPException(status_code=400, detail="champ invalide — valeurs: site, produit, objet, type")
    if body.operateur not in ("contient", "egal", "commence_par"):
        raise HTTPException(status_code=400, detail="operateur invalide — valeurs: contient, egal, commence_par")
    now = datetime.now(timezone.utc).isoformat()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO exclusions (champ, operateur, valeur, raison, actif, cree_par, date_creation) VALUES (?,?,?,?,1,?,?)",
            (body.champ, body.operateur, body.valeur, body.raison, body.cree_par, now),
        )
    return {"status": "created"}


@router.patch("/exclusions/{exclusion_id}")
def toggle_exclusion(exclusion_id: int):
    with get_db() as conn:
        row = conn.execute("SELECT actif FROM exclusions WHERE id = ?", (exclusion_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Règle introuvable")
        conn.execute("UPDATE exclusions SET actif = ? WHERE id = ?", (0 if row["actif"] else 1, exclusion_id))
    return {"status": "toggled"}


@router.delete("/exclusions/{exclusion_id}")
def delete_exclusion(exclusion_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM exclusions WHERE id = ?", (exclusion_id,))
    return {"status": "deleted"}

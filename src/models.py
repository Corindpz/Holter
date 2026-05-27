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
    capa_justification: Optional[str] = None
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

import json
from typing import List, Dict
from src.models import Ticket, DictionaryEntry


# ── System prompt ─────────────────────────────────────────────
_SYSTEM_RAQA = """Tu es un consultant senior RAQA et officier de vigilance pour les logiciels SaMD/SIH.
Cadre réglementaire : MDR 2017/745 Art.87 + Annexe I §17 ; ISO 13485 §8.2.2 §8.5.1 ; \
ISO 14971 ; CEI 62304 ; ISO 27001 ; HDS ; guides ANSM.

MISSION PRINCIPALE — approche agnostique du statut :
Tu ne fais PAS confiance au statut ou à la clôture du ticket.
Ton rôle est de détecter si un signal de vigilance existe dans le contenu, \
INDÉPENDAMMENT du fait que le ticket soit marqué Infirmé, Fermé, CLOS, ou Résolu.
Un ticket clôturé à tort est aussi dangereux qu'un ticket ouvert non traité.

TAXONOMIE :
- MV (matériovigilance) : incident ou risque d'incident impliquant un dispositif médical \
  (panne, dysfonctionnement, données patient altérées, décision clinique compromise)
- IV (identitovigilance) : confusion d'identité patient, erreur de rapprochement, doublons \
  dans les référentiels (INS/INS-A/Traits stricts)
- SECU (sécurité) : accès non autorisé, fuite de données, vulnérabilité logicielle, \
  non-conformité ISO 27001/HDS

RÈGLES ABSOLUES :
1. Ne minimise jamais un risque patient — en cas de doute, escalade.
2. MV et IV doivent être signalés même en cas de doute, sauf preuve explicite d'absence de risque.
3. Si le ticket est Infirmé/Fermé/CLOS, vérifie EXPLICITEMENT :
   a) La clôture est-elle argumentée de manière convaincante dans la description ?
   b) Y a-t-il une contradiction entre l'objet et la description ?
   c) Y a-t-il un impact patient potentiel non mentionné ?
   Si l'une des réponses est "pas sûr" → SURVEILLER minimum.
4. Un ticket incomplet (description vide, objet vague, champs manquants) sur un produit SaMD \
   n'est pas automatiquement CLOS — c'est un signal de mauvaise complétude à surveiller.
5. Réponds UNIQUEMENT en JSON valide, sans texte autour."""


ANALYSIS_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "decision":           {"type": "string", "enum": ["ANALYSE_REQUISE", "SURVEILLER", "CLOS"]},
        "signal":             {"type": ["string", "null"], "enum": ["MV", "IV", "SECU", None]},
        "niveau":             {"type": ["string", "null"], "enum": ["CRITIQUE", "MAJEUR", "MINEUR", None]},
        "confiance":          {"type": "number", "minimum": 0.0, "maximum": 1.0},
        "raisonnement":       {"type": "string"},
        "articles_cites":     {"type": "array", "items": {"type": "string"}},
        "capa_suggere":       {"type": "boolean"},
        "capa_justification": {"type": ["string", "null"]},
        "mots_cles":          {"type": "array", "items": {"type": "string"}},
    },
    "required": ["decision", "confiance", "raisonnement"],
}


# ── Helpers ───────────────────────────────────────────────────
def _format_dictionary(entries: List[DictionaryEntry]) -> str:
    if not entries:
        return ""
    lines = ["Patterns réglementaires validés par les experts (poids moyen/fort) :"]
    for e in entries:
        if e.poids in ("moyen", "fort"):
            marker = " [FORT — bypass recommandé]" if e.poids == "fort" else ""
            lines.append(
                f'- "{e.pattern}" → {e.signal} {e.niveau}'
                f'{", " + e.article if e.article else ""}{marker}'
            )
    return "\n".join(lines) if len(lines) > 1 else ""


def _format_ticket(ticket: Ticket) -> str:
    statut = ticket.statut or "Non renseigné"
    desc = ticket.description_anonyme or ticket.description or "(vide)"
    return (
        f"=== TICKET {ticket.id} ===\n"
        f"Objet     : {ticket.objet or '(vide)'}\n"
        f"Statut    : {statut}\n"
        f"Priorité  : {ticket.priorite or 'Non renseignée'}\n"
        f"Produit   : {ticket.produit or 'Non renseigné'}\n"
        f"Site      : {ticket.site or 'Non renseigné'}\n"
        f"Description:\n{desc}"
    )


def _coherence_instruction(ticket: Ticket) -> str:
    statut_lower = (ticket.statut or "").lower()
    is_closed = any(k in statut_lower for k in ("infirm", "ferm", "clos", "résol", "resol", "annul"))
    if is_closed:
        return (
            "\n⚠ Ce ticket est marqué comme clôturé/infirmé. "
            "Avant de confirmer CLOS, réponds explicitement dans le raisonnement à ces 3 questions : "
            "(1) La clôture est-elle justifiée par la description ? "
            "(2) Y a-t-il une contradiction objet/description ? "
            "(3) Y a-t-il un impact patient potentiel même indirect ?"
        )
    if not ticket.description_anonyme and not ticket.description:
        return (
            "\n⚠ Description vide. Un ticket sans description sur un SaMD ne peut pas être "
            "clôturé avec certitude — note le manque de complétude dans le raisonnement."
        )
    return ""


# ── Pass 1 — Triage rapide ────────────────────────────────────
def build_pass1_messages(
    ticket: Ticket, dictionary_entries: List[DictionaryEntry]
) -> List[Dict[str, str]]:
    dict_section = _format_dictionary(dictionary_entries)
    coherence = _coherence_instruction(ticket)
    user_content = (
        f"{dict_section}\n\n"
        f"{_format_ticket(ticket)}"
        f"{coherence}\n\n"
        "Triage initial : y a-t-il un signal MV/IV/SECU ou une raison de surveiller ce ticket ? "
        "Si CLOS avec confiance ≥ 0.85, justifie pourquoi la clôture est correcte. JSON uniquement."
    )
    return [
        {"role": "system", "content": _SYSTEM_RAQA},
        {"role": "user", "content": user_content},
    ]


# ── Pass 2 — Analyse approfondie + RAG ───────────────────────
def build_pass2_messages(
    ticket: Ticket,
    dictionary_entries: List[DictionaryEntry],
    rag_passages: List[str],
) -> List[Dict[str, str]]:
    dict_section = _format_dictionary(dictionary_entries)
    rag_section = (
        "Extraits réglementaires pertinents :\n" + "\n---\n".join(rag_passages)
        if rag_passages else ""
    )
    coherence = _coherence_instruction(ticket)
    user_content = (
        f"{dict_section}\n\n"
        f"{rag_section}\n\n"
        f"{_format_ticket(ticket)}"
        f"{coherence}\n\n"
        "Analyse approfondie. Suis ce raisonnement en 4 étapes :\n"
        "1. INDICES — liste les éléments du ticket qui pointent vers un signal ou son absence\n"
        "2. COHÉRENCE — le statut du ticket est-il justifié par son contenu ? Contradiction ?\n"
        "3. ARTICLES — cite les articles MDR/ISO/ANSM applicables s'il y a un signal\n"
        "4. CONCLUSION — décision finale avec confiance calibrée\n"
        "Si capa_suggere est true, renseigne capa_justification (1-2 phrases). JSON uniquement."
    )
    return [
        {"role": "system", "content": _SYSTEM_RAQA},
        {"role": "user", "content": user_content},
    ]


# ── Pass 3 — Auto-critique ────────────────────────────────────
def build_pass3_messages(
    ticket: Ticket, prior_analysis_json: str
) -> List[Dict[str, str]]:
    coherence = _coherence_instruction(ticket)
    user_content = (
        f"{_format_ticket(ticket)}"
        f"{coherence}\n\n"
        f"Voici ton analyse précédente :\n{prior_analysis_json}\n\n"
        "Auto-critique en 3 points :\n"
        "1. Quel élément du ticket pourrait INVALIDER ta conclusion actuelle ?\n"
        "2. Si le ticket était d'une clinique partenaire et impliquait un patient réel, "
        "changerais-tu ta décision ?\n"
        "3. La confiance est-elle bien calibrée (ni trop haute sur un ticket ambigu, "
        "ni trop basse sur un cas clair) ?\n"
        "Conclus avec la décision finale (identique ou révisée) et une confiance ajustée. "
        "JSON uniquement."
    )
    return [
        {"role": "system", "content": _SYSTEM_RAQA},
        {"role": "user", "content": user_content},
    ]

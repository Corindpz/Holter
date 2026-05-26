import json
from typing import List, Dict
from src.models import Ticket, DictionaryEntry


_SYSTEM_RAQA = """Tu es un consultant senior RAQA et officier de vigilance pour les logiciels SaMD/SIH.
Cadre réglementaire applicable : MDR 2017/745 Art.87, Annexe I §17 ; ISO 13485 §8.2.2 et §8.5.1 ;
ISO 14971 ; CEI 62304 ; RNI/INS ; guides ANSM.

Règles absolues :
- Ne minimise jamais un risque patient.
- Tout signal MV ou IV doit être déclaré même en cas de doute.
- Le champ confiance est ta propre estimation (0.0 = très incertain, 1.0 = certitude absolue).
- Réponds UNIQUEMENT en JSON valide, sans texte autour."""

ANALYSIS_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "decision": {"type": "string", "enum": ["ANALYSE_REQUISE", "SURVEILLER", "CLOS"]},
        "signal": {"type": ["string", "null"], "enum": ["MV", "IV", "SECU", None]},
        "niveau": {"type": ["string", "null"], "enum": ["CRITIQUE", "MAJEUR", "MINEUR", None]},
        "confiance": {"type": "number", "minimum": 0.0, "maximum": 1.0},
        "raisonnement": {"type": "string"},
        "articles_cites": {"type": "array", "items": {"type": "string"}},
        "capa_suggere": {"type": "boolean"},
        "mots_cles": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["decision", "confiance", "raisonnement"],
}


def _format_dictionary(entries: List[DictionaryEntry]) -> str:
    if not entries:
        return ""
    lines = ["Patterns réglementaires validés par les experts précédents :"]
    for e in entries:
        if e.poids in ("moyen", "fort"):
            lines.append(f'- "{e.pattern}" → signal {e.signal} ({e.niveau}), {e.article or ""}')
    return "\n".join(lines) if len(lines) > 1 else ""


def _format_ticket(ticket: Ticket) -> str:
    return (
        f"Ticket ID: {ticket.id}\n"
        f"Objet: {ticket.objet or ''}\n"
        f"Priorité: {ticket.priorite or ''}\n"
        f"Statut: {ticket.statut or ''}\n"
        f"Produit: {ticket.produit or ''}\n"
        f"Site: {ticket.site or ''}\n"
        f"Description: {ticket.description_anonyme or ''}"
    )


def build_pass1_messages(
    ticket: Ticket, dictionary_entries: List[DictionaryEntry]
) -> List[Dict[str, str]]:
    dict_section = _format_dictionary(dictionary_entries)
    user_content = f"{dict_section}\n\n{_format_ticket(ticket)}\n\nClassifie ce ticket. JSON uniquement."
    return [
        {"role": "system", "content": _SYSTEM_RAQA},
        {"role": "user", "content": user_content},
    ]


def build_pass2_messages(
    ticket: Ticket,
    dictionary_entries: List[DictionaryEntry],
    rag_passages: List[str],
) -> List[Dict[str, str]]:
    dict_section = _format_dictionary(dictionary_entries)
    rag_section = ""
    if rag_passages:
        rag_section = "Extraits réglementaires pertinents :\n" + "\n---\n".join(rag_passages)
    user_content = (
        f"{dict_section}\n\n{rag_section}\n\n{_format_ticket(ticket)}\n\n"
        "Analyse approfondie avec chain-of-thought. Énumère d'abord les indices observés, "
        "les articles applicables, les contradictions éventuelles, puis conclus. JSON uniquement."
    )
    return [
        {"role": "system", "content": _SYSTEM_RAQA},
        {"role": "user", "content": user_content},
    ]


def build_pass3_messages(
    ticket: Ticket, prior_analysis_json: str
) -> List[Dict[str, str]]:
    user_content = (
        f"{_format_ticket(ticket)}\n\n"
        f"Voici ton analyse précédente :\n{prior_analysis_json}\n\n"
        "Challenge cette analyse. Es-tu certain(e) ? "
        "Quels éléments pourraient te faire changer d'avis sur le signal ou la décision ? "
        "Si ta conclusion reste identique, maintiens-la avec une confiance ajustée. JSON uniquement."
    )
    return [
        {"role": "system", "content": _SYSTEM_RAQA},
        {"role": "user", "content": user_content},
    ]

from typing import List
from src.models import TrendCluster, PriorityRecommendation
from src.analysis.ollama_client import OllamaClient

PRIORITY_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "recommendations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rang": {"type": "integer"},
                    "titre": {"type": "string"},
                    "cluster": {"type": "string"},
                    "score": {"type": "number"},
                    "justification": {"type": "string"},
                    "articles_mdr": {"type": "array", "items": {"type": "string"}},
                    "action_suggeree": {"type": "string"},
                    "delai_reglementaire": {"type": "string"},
                },
                "required": [
                    "rang", "titre", "cluster", "score", "justification",
                    "articles_mdr", "action_suggeree", "delai_reglementaire",
                ],
            },
        }
    },
    "required": ["recommendations"],
}

_SYSTEM_PRIORITY = (
    "Tu es un expert réglementaire médical (MDR 2017/745, IVDR, ISO 13485, MEDDEV 2.12/1).\n"
    "Tu reçois une liste de clusters de signaux PMS avec leurs scores composites calculés.\n"
    "Pour chaque cluster, génère une recommandation structurée.\n"
    "Réponds UNIQUEMENT avec le JSON demandé, sans commentaire."
)


def build_priority_messages(
    clusters: List[TrendCluster], semaine_code: str, total_tickets: int
) -> List[dict]:
    lines = [f"Semaine : {semaine_code} | Total tickets analysés : {total_tickets}\n"]
    lines.append("Clusters détectés (triés par score composite) :")
    for i, c in enumerate(clusters, 1):
        vel_pct = int((c.velocite - 1.0) * 100)
        vel_str = f"+{vel_pct}% vs 13S" if vel_pct > 0 else "stable"
        sig_str = c.signal or "Sans signal"
        niv_str = c.niveau or ""
        label = f"Signal {sig_str} {niv_str}".strip() + f" — {c.produit}"
        lines.append(f"{i}. [Score {c.score}] {label} — {c.count_current} tickets | {vel_str}")
    lines.append(
        "\nPour chaque cluster, génère un objet JSON avec rang, titre (max 80 chars), "
        "cluster, score, justification (2-4 phrases avec articles MDR/ISO), "
        "articles_mdr (liste), action_suggeree (concrète), delai_reglementaire."
    )
    return [
        {"role": "system", "content": _SYSTEM_PRIORITY},
        {"role": "user", "content": "\n".join(lines)},
    ]


async def generate_priorities(
    clusters: List[TrendCluster],
    semaine_code: str,
    total_tickets: int,
    ollama: OllamaClient,
) -> List[PriorityRecommendation]:
    if not clusters:
        return []
    msgs = build_priority_messages(clusters, semaine_code, total_tickets)
    raw = await ollama.chat(msgs, json_schema=PRIORITY_JSON_SCHEMA)
    items = raw.get("recommendations", [])
    return [PriorityRecommendation(**item) for item in items]

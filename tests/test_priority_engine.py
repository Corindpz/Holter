from unittest.mock import AsyncMock, MagicMock
import pytest
from src.models import TrendCluster
from src.analytics.priority_engine import build_priority_messages, generate_priorities


def _cluster(produit="Easily", signal="IV", niveau="MAJEUR", count=6, score=87.3, velocite=1.5):
    return TrendCluster(
        cluster_id=f"{produit}|{signal}|{niveau}",
        produit=produit,
        signal=signal,
        niveau=niveau,
        count_current=count,
        avg_13s=4.0,
        score=score,
        gravite_weight=2.0,
        velocite=velocite,
    )


def test_build_priority_messages_contains_semaine_and_total():
    msgs = build_priority_messages([_cluster()], "2026-W21", 1706)
    user = msgs[1]["content"]
    assert "2026-W21" in user
    assert "1706" in user


def test_build_priority_messages_contains_cluster_data():
    msgs = build_priority_messages([_cluster()], "2026-W21", 1706)
    user = msgs[1]["content"]
    assert "Easily" in user
    assert "87.3" in user


def test_build_priority_messages_has_system_and_user_roles():
    msgs = build_priority_messages([_cluster()], "2026-W21", 100)
    assert msgs[0]["role"] == "system"
    assert msgs[1]["role"] == "user"


async def test_generate_priorities_empty_clusters_returns_empty():
    result = await generate_priorities([], "2026-W21", 0, MagicMock())
    assert result == []


async def test_generate_priorities_parses_ollama_response():
    mock_ollama = MagicMock()
    mock_ollama.chat = AsyncMock(return_value={
        "recommendations": [{
            "rang": 1,
            "titre": "Signal IV MAJEUR en hausse sur Easily",
            "cluster": "Signal IV MAJEUR — Easily",
            "score": 87.3,
            "justification": "Conformément à l'article 88 MDR...",
            "articles_mdr": ["Art. 88 MDR"],
            "action_suggeree": "Ouvrir une revue de tendance",
            "delai_reglementaire": "15 jours",
        }]
    })
    result = await generate_priorities([_cluster()], "2026-W21", 1706, mock_ollama)
    assert len(result) == 1
    assert result[0].rang == 1
    assert result[0].titre == "Signal IV MAJEUR en hausse sur Easily"
    assert result[0].articles_mdr == ["Art. 88 MDR"]


async def test_generate_priorities_empty_ollama_recommendations():
    mock_ollama = MagicMock()
    mock_ollama.chat = AsyncMock(return_value={"recommendations": []})
    result = await generate_priorities([_cluster()], "2026-W21", 100, mock_ollama)
    assert result == []

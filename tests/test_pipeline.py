import pytest
import json
from unittest.mock import AsyncMock, MagicMock
from src.analysis.pipeline import AnalysisPipeline
from src.models import Ticket, DictionaryEntry


def _make_ollama_result(decision="CLOS", confiance=0.9, signal=None):
    return {
        "decision": decision, "signal": signal, "niveau": None,
        "confiance": confiance, "raisonnement": "Test raisonnement.",
        "articles_cites": [], "capa_suggere": False, "mots_cles": []
    }


@pytest.fixture
def mock_ollama():
    client = AsyncMock()
    client.chat = AsyncMock(return_value=_make_ollama_result())
    return client


@pytest.fixture
def mock_rag():
    rag = MagicMock()
    rag.retrieve = MagicMock(return_value=[])
    return rag


@pytest.mark.asyncio
async def test_pipeline_high_confidence_clos_stays_pass1(mock_ollama, mock_rag):
    pipeline = AnalysisPipeline(
        ollama=mock_ollama, rag=mock_rag, dictionary_entries=[],
        threshold_clos=0.85, threshold_escalate=0.70
    )
    ticket = Ticket(id="001", semaine_code="2026-W21", objet="Login lent", description_anonyme="lent")
    result = await pipeline.analyze(ticket)
    assert result.decision == "CLOS"
    assert result.passe_finale == 1


@pytest.mark.asyncio
async def test_pipeline_low_confidence_escalates_to_pass2(mock_rag):
    ollama = AsyncMock()
    ollama.chat = AsyncMock(return_value=_make_ollama_result(decision="ANALYSE_REQUISE", confiance=0.75))
    pipeline = AnalysisPipeline(
        ollama=ollama, rag=mock_rag, dictionary_entries=[],
        threshold_clos=0.85, threshold_escalate=0.70
    )
    ticket = Ticket(id="002", semaine_code="2026-W21", objet="VIDAL KO", description_anonyme="vidal ko")
    result = await pipeline.analyze(ticket)
    assert result.passe_finale == 2
    assert ollama.chat.call_count == 2


@pytest.mark.asyncio
async def test_pipeline_very_low_confidence_escalates_to_pass3(mock_rag):
    ollama = AsyncMock()
    ollama.chat = AsyncMock(return_value=_make_ollama_result(decision="SURVEILLER", confiance=0.60))
    pipeline = AnalysisPipeline(
        ollama=ollama, rag=mock_rag, dictionary_entries=[],
        threshold_clos=0.85, threshold_escalate=0.70
    )
    ticket = Ticket(id="003", semaine_code="2026-W21", objet="Incident", description_anonyme="incident")
    result = await pipeline.analyze(ticket)
    assert result.passe_finale == 3
    assert ollama.chat.call_count == 3

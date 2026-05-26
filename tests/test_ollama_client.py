import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from src.analysis.ollama_client import OllamaClient, select_model


def test_select_model_8gb():
    model = select_model(available_ram_gb=7, override=None)
    assert model == "mistral:7b-instruct-q4_K_M"


def test_select_model_16gb():
    model = select_model(available_ram_gb=15, override=None)
    assert model == "qwen2.5:14b-instruct-q4_K_M"


def test_select_model_32gb():
    model = select_model(available_ram_gb=30, override=None)
    assert model == "qwen2.5:32b-instruct-q4_K_M"


def test_select_model_override():
    model = select_model(available_ram_gb=64, override="llama3.3:70b")
    assert model == "llama3.3:70b"


@pytest.mark.asyncio
async def test_chat_returns_parsed_json():
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "message": {"content": '{"decision": "CLOS", "confiance": 0.9}'}
    }
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_class.return_value = mock_client

        client = OllamaClient(base_url="http://localhost:11434", model="test-model")
        result = await client.chat(messages=[{"role": "user", "content": "test"}])
        assert result == {"decision": "CLOS", "confiance": 0.9}

import json
from typing import Any, Dict, List, Optional

_DEFAULT_MODEL = "claude-haiku-4-5-20251001"


class AnthropicClient:
    """Client Anthropic — interface identique à OllamaClient."""

    def __init__(self, api_key: str, model: str = _DEFAULT_MODEL):
        import anthropic
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def chat(
        self,
        messages: List[Dict[str, str]],
        json_schema: Optional[Dict] = None,
        timeout: float = 60.0,
    ) -> Dict[str, Any]:
        # Séparer le system prompt des messages user/assistant
        system = ""
        filtered = []
        for m in messages:
            if m["role"] == "system":
                system = m["content"]
            else:
                filtered.append(m)

        # Forcer la réponse JSON via le prefill
        if json_schema and (not filtered or filtered[-1]["role"] != "assistant"):
            filtered.append({"role": "assistant", "content": "{"})

        kwargs: Dict[str, Any] = {
            "model": self.model,
            "max_tokens": 512,
            "messages": filtered,
        }
        if system:
            kwargs["system"] = system

        response = await self._client.messages.create(**kwargs)
        content = response.content[0].text

        # Reconstruire le JSON si on a utilisé le prefill
        if filtered and filtered[-1]["role"] == "assistant":
            content = "{" + content

        return json.loads(content)

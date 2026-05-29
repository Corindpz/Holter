import asyncio
import json
from typing import Any, Dict, List, Optional

_DEFAULT_MODEL = "llama-3.3-70b-versatile"
_MAX_RETRIES = 6


class GroqClient:
    """Client Groq — interface identique à OllamaClient."""

    def __init__(self, api_key: str, model: str = _DEFAULT_MODEL):
        from groq import AsyncGroq
        self._client = AsyncGroq(api_key=api_key)
        self.model = model

    async def chat(
        self,
        messages: List[Dict[str, str]],
        json_schema: Optional[Dict] = None,
        timeout: float = 60.0,
    ) -> Dict[str, Any]:
        kwargs: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.1,
            "max_tokens": 512,
        }
        if json_schema:
            kwargs["response_format"] = {"type": "json_object"}

        delay = 5.0
        for attempt in range(_MAX_RETRIES):
            try:
                response = await self._client.chat.completions.create(**kwargs)
                content = response.choices[0].message.content
                return json.loads(content)
            except Exception as e:
                status = getattr(e, "status_code", None)
                is_rate_limit = status == 429 or "rate" in str(e).lower()
                if is_rate_limit and attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, 60.0)
                else:
                    raise

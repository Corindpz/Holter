import json
import psutil
import httpx
from typing import Any, Dict, List, Optional


_MODEL_TABLE = [
    (60, "qwen2.5:72b-instruct-q4_K_M"),
    (28, "qwen2.5:32b-instruct-q4_K_M"),
    (12, "qwen2.5:14b-instruct-q4_K_M"),
    (0,  "mistral:7b-instruct-q4_K_M"),
]


def select_model(available_ram_gb: float, override: Optional[str]) -> str:
    if override:
        return override
    for threshold, model in _MODEL_TABLE:
        if available_ram_gb >= threshold:
            return model
    return "mistral:7b-instruct-q4_K_M"


def get_available_ram_gb() -> float:
    return psutil.virtual_memory().available / (1024 ** 3)


class OllamaClient:
    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def chat(
        self,
        messages: List[Dict[str, str]],
        json_schema: Optional[Dict] = None,
        timeout: float = 300.0,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
        }
        if json_schema:
            payload["format"] = json_schema
        else:
            payload["format"] = "json"

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(f"{self.base_url}/api/chat", json=payload)
            response.raise_for_status()
            content = response.json()["message"]["content"]
            return json.loads(content)

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self.base_url}/api/version")
                return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self.base_url}/api/tags")
                if r.status_code == 200:
                    return [m["name"] for m in r.json().get("models", [])]
        except Exception:
            pass
        return []

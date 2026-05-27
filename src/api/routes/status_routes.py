from fastapi import APIRouter
from src.analysis.ollama_client import OllamaClient, select_model, get_available_ram_gb
from src.config import get_settings

router = APIRouter(tags=["status"])


@router.get("/status")
async def get_status():
    settings = get_settings()
    ram_gb = get_available_ram_gb()
    model = select_model(ram_gb, settings.get("model_override"))
    ollama = OllamaClient(settings["ollama_url"], model)

    running = await ollama.health_check()
    downloaded_models = await ollama.list_models() if running else []
    model_ready = any(m.startswith(model.split(":")[0]) for m in downloaded_models)

    return {
        "ollama_running": running,
        "model_selected": model,
        "model_ready": model_ready,
        "downloaded_models": downloaded_models,
        "ram_available_gb": round(ram_gb, 1),
        "pull_command": f"ollama pull {model}" if not model_ready else None,
    }

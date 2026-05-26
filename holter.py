import json
import socket
import subprocess
import sys
import time
import threading
import webbrowser
from pathlib import Path

import uvicorn

from src.db.schema import init_db
from src.db.connection import configure


def _load_settings() -> dict:
    path = Path("settings.json")
    if not path.exists():
        return {"port": 8765, "db_path": "./holter.db"}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"[HOLTER] settings.json invalide : {exc}", file=sys.stderr)
        sys.exit(1)


def _check_port(port: int) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", port)) == 0:
            print(
                f"[HOLTER] Le port {port} est déjà utilisé. "
                "Modifiez 'port' dans settings.json ou fermez l'application en cours.",
                file=sys.stderr,
            )
            sys.exit(1)


def _ollama_running(ollama_url: str) -> bool:
    host_port = ollama_url.replace("http://", "").replace("https://", "").split("/")[0]
    host, _, port_str = host_port.partition(":")
    port = int(port_str) if port_str else 11434
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex((host, port)) == 0


def _find_ollama_exe() -> Path | None:
    candidates = [
        Path(sys.executable).parent / "ollama.exe",
        Path.home() / "AppData" / "Local" / "Programs" / "Ollama" / "ollama.exe",
        Path("C:/Program Files/Ollama/ollama.exe"),
        Path("C:/Program Files (x86)/Ollama/ollama.exe"),
    ]
    for p in candidates:
        if p.exists():
            return p
    # Last resort: look in PATH
    import shutil
    found = shutil.which("ollama")
    return Path(found) if found else None


def _ensure_ollama(ollama_url: str) -> None:
    if _ollama_running(ollama_url):
        print("[HOLTER] Ollama déjà actif.")
        return

    exe = _find_ollama_exe()
    if exe is None:
        print(
            "[HOLTER] Ollama introuvable. L'analyse IA ne sera pas disponible.\n"
            "         Téléchargez Ollama sur https://ollama.com/download",
            file=sys.stderr,
        )
        return

    print(f"[HOLTER] Démarrage d'Ollama ({exe}) ...")
    subprocess.Popen(
        [str(exe), "serve"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )

    # Wait up to 30 seconds for Ollama to be ready
    for i in range(30):
        time.sleep(1)
        if _ollama_running(ollama_url):
            print("[HOLTER] Ollama prêt.")
            return
        if i % 5 == 4:
            print(f"[HOLTER] En attente d'Ollama... ({i+1}s)")

    print(
        "[HOLTER] Ollama ne répond pas après 30s. L'analyse IA ne sera pas disponible.",
        file=sys.stderr,
    )


def _open_browser(port: int, delay: float = 1.5) -> None:
    time.sleep(delay)
    webbrowser.open(f"http://localhost:{port}")


def main() -> None:
    settings = _load_settings()
    db_path = settings.get("db_path", "./holter.db")
    port = settings.get("port", 8765)
    ollama_url = settings.get("ollama_url", "http://localhost:11434")

    _check_port(port)
    _ensure_ollama(ollama_url)
    configure(db_path)
    init_db(db_path)

    threading.Thread(target=_open_browser, args=(port,), daemon=True).start()

    from src.api.main import app
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()

import json
import socket
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


def _open_browser(port: int, delay: float = 1.5) -> None:
    time.sleep(delay)
    webbrowser.open(f"http://localhost:{port}")


def main() -> None:
    settings = _load_settings()
    db_path = settings.get("db_path", "./holter.db")
    port = settings.get("port", 8765)

    _check_port(port)
    configure(db_path)
    init_db(db_path)

    threading.Thread(target=_open_browser, args=(port,), daemon=True).start()

    from src.api.main import app
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()

import json
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
    return json.loads(path.read_text(encoding="utf-8"))


def _open_browser(port: int, delay: float = 1.5) -> None:
    time.sleep(delay)
    webbrowser.open(f"http://localhost:{port}")


def main() -> None:
    settings = _load_settings()
    db_path = settings.get("db_path", "./holter.db")
    port = settings.get("port", 8765)

    configure(db_path)
    init_db(db_path)

    threading.Thread(target=_open_browser, args=(port,), daemon=True).start()

    from src.api.main import app
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()

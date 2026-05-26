from typing import List
from src.models import Ticket
from src.db.connection import get_db


def deduplicate(tickets: List[Ticket], semaine_code: str) -> List[Ticket]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id FROM tickets WHERE semaine_code = ?", (semaine_code,)
        ).fetchall()
    existing_ids = {row["id"] for row in rows}
    return [t for t in tickets if t.id not in existing_ids]

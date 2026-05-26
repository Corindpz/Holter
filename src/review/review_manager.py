from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from src.db.connection import get_db


class ReviewManager:
    def record(
        self,
        ticket_id: str,
        semaine_code: str,
        expert: str,
        action: str,
        decision_finale: str,
        commentaire: Optional[str] = None,
    ) -> None:
        if action in ("RECLASSER", "ECARTER") and not commentaire:
            raise ValueError(f"Un commentaire est obligatoire pour l'action {action}")
        now = datetime.now(timezone.utc).isoformat()
        with get_db() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO decisions
                   (ticket_id, semaine_code, expert_nom, action_expert, decision_finale, commentaire, horodatage)
                   VALUES (?,?,?,?,?,?,?)""",
                (ticket_id, semaine_code, expert, action, decision_finale, commentaire, now),
            )

    def get_decisions(self, semaine_code: str) -> List[Dict[str, Any]]:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM decisions WHERE semaine_code = ?", (semaine_code,)
            ).fetchall()
        return [dict(r) for r in rows]

    def pending_count(self, semaine_code: str) -> int:
        with get_db() as conn:
            decided_ids = {
                r["ticket_id"]
                for r in conn.execute(
                    "SELECT DISTINCT ticket_id FROM decisions WHERE semaine_code = ?",
                    (semaine_code,),
                ).fetchall()
            }
            total = conn.execute(
                "SELECT COUNT(*) as n FROM analyses WHERE semaine_code = ? AND decision = 'ANALYSE_REQUISE'",
                (semaine_code,),
            ).fetchone()["n"]
        return total - len(decided_ids)

    def set_week_expert(self, semaine_code: str, expert_nom: str) -> None:
        with get_db() as conn:
            conn.execute(
                "UPDATE semaines SET expert_nom = ? WHERE code = ?",
                (expert_nom, semaine_code),
            )

    def get_week_expert(self, semaine_code: str) -> Optional[str]:
        with get_db() as conn:
            row = conn.execute(
                "SELECT expert_nom FROM semaines WHERE code = ?", (semaine_code,)
            ).fetchone()
        return row["expert_nom"] if row else None

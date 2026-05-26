from typing import List, Optional
from src.db.connection import get_db
from src.models import DictionaryEntry


_MOYEN_THRESHOLD = 3
_FORT_THRESHOLD = 10


class DictionaryManager:
    def add(self, entry: DictionaryEntry) -> None:
        with get_db() as conn:
            existing = conn.execute(
                "SELECT id FROM dictionnaire WHERE pattern = ?", (entry.pattern,)
            ).fetchone()
            if existing:
                raise ValueError(f"Pattern déjà existant : {entry.pattern!r}")
            conn.execute(
                """INSERT INTO dictionnaire
                   (pattern, signal, niveau, article, cree_par, date_creation, semaines_validees, poids)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (entry.pattern, entry.signal, entry.niveau, entry.article,
                 entry.cree_par, entry.date_creation, entry.semaines_validees, entry.poids),
            )

    def get(self, pattern: str) -> Optional[DictionaryEntry]:
        with get_db() as conn:
            row = conn.execute(
                "SELECT * FROM dictionnaire WHERE pattern = ?", (pattern,)
            ).fetchone()
        return _row_to_entry(row) if row else None

    def list_all(self) -> List[DictionaryEntry]:
        with get_db() as conn:
            rows = conn.execute("SELECT * FROM dictionnaire ORDER BY poids DESC, pattern").fetchall()
        return [_row_to_entry(r) for r in rows]

    def list_for_prompt(self) -> List[DictionaryEntry]:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM dictionnaire WHERE poids IN ('moyen','fort') ORDER BY poids DESC"
            ).fetchall()
        return [_row_to_entry(r) for r in rows]

    def increment_validation(self, pattern: str) -> None:
        with get_db() as conn:
            conn.execute(
                "UPDATE dictionnaire SET semaines_validees = semaines_validees + 1 WHERE pattern = ?",
                (pattern,),
            )
            row = conn.execute(
                "SELECT semaines_validees FROM dictionnaire WHERE pattern = ?", (pattern,)
            ).fetchone()
            if row:
                n = row["semaines_validees"]
                if n >= _FORT_THRESHOLD:
                    poids = "fort"
                elif n >= _MOYEN_THRESHOLD:
                    poids = "moyen"
                else:
                    poids = "faible"
                conn.execute(
                    "UPDATE dictionnaire SET poids = ? WHERE pattern = ?", (poids, pattern)
                )

    def delete(self, pattern: str) -> None:
        with get_db() as conn:
            conn.execute("DELETE FROM dictionnaire WHERE pattern = ?", (pattern,))


def _row_to_entry(row) -> DictionaryEntry:
    return DictionaryEntry(
        id=row["id"],
        pattern=row["pattern"],
        signal=row["signal"],
        niveau=row["niveau"],
        article=row["article"],
        cree_par=row["cree_par"],
        date_creation=row["date_creation"],
        semaines_validees=row["semaines_validees"],
        poids=row["poids"],
    )

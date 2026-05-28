from collections import defaultdict
from src.db.connection import get_db
from src.models import TrendCluster

_GRAVITE: dict[str, float] = {"CRITIQUE": 3.0, "MAJEUR": 2.0, "MINEUR": 1.0}


def _get_window(conn, semaine_code: str, weeks: int) -> list[str]:
    rows = conn.execute(
        "SELECT code FROM semaines WHERE code <= ? ORDER BY code DESC LIMIT ?",
        (semaine_code, weeks),
    ).fetchall()
    return [r["code"] for r in rows]


def get_top_clusters(semaine_code: str, weeks: int = 13, n: int = 10) -> list[TrendCluster]:
    with get_db() as conn:
        window = _get_window(conn, semaine_code, weeks)
        if not window:
            return []
        placeholders = ",".join("?" * len(window))
        rows = conn.execute(
            f"""SELECT t.produit, a.signal, a.niveau, a.semaine_code, COUNT(*) as cnt
                FROM analyses a
                JOIN tickets t ON t.id = a.ticket_id AND t.semaine_code = a.semaine_code
                WHERE a.semaine_code IN ({placeholders})
                  AND a.passe_finale != 0
                  AND t.produit IS NOT NULL AND t.produit != ''
                GROUP BY t.produit, a.signal, a.niveau, a.semaine_code""",
            window,
        ).fetchall()

    counts: dict[str, dict[str, int]] = defaultdict(dict)
    meta: dict[str, tuple] = {}
    for row in rows:
        cid = f"{row['produit']}|{row['signal'] or ''}|{row['niveau'] or ''}"
        counts[cid][row["semaine_code"]] = row["cnt"]
        if cid not in meta:
            meta[cid] = (row["produit"], row["signal"], row["niveau"])

    raw_scores = []
    for cid, week_counts in counts.items():
        count_current = week_counts.get(semaine_code, 0)
        if count_current < 2:
            continue
        avg_13s = sum(week_counts.values()) / len(window)
        velocite = max(1.0, min(5.0, count_current / avg_13s)) if avg_13s > 0 else 1.0
        produit, signal, niveau = meta[cid]
        gravite_weight = _GRAVITE.get(niveau, 0.5)
        raw = count_current * gravite_weight * velocite
        raw_scores.append(
            (cid, produit, signal, niveau, count_current, round(avg_13s, 2), gravite_weight, round(velocite, 2), raw)
        )

    if not raw_scores:
        return []

    max_raw = max(r[8] for r in raw_scores)
    clusters = [
        TrendCluster(
            cluster_id=cid,
            produit=produit,
            signal=signal,
            niveau=niveau,
            count_current=count_current,
            avg_13s=avg_13s,
            score=round((raw / max_raw) * 100, 1) if max_raw > 0 else 0.0,
            gravite_weight=gravite_weight,
            velocite=velocite,
        )
        for cid, produit, signal, niveau, count_current, avg_13s, gravite_weight, velocite, raw in raw_scores
    ]
    clusters.sort(key=lambda c: c.score, reverse=True)
    return clusters[:n]


def get_trend_series(semaine_code: str, weeks: int = 13) -> dict:
    with get_db() as conn:
        window = _get_window(conn, semaine_code, weeks)
        if not window:
            return {"semaines": [], "series": {"MV": [], "IV": [], "SECU": []}, "top_produits": []}
        window_sorted = sorted(window)
        placeholders = ",".join("?" * len(window))
        rows = conn.execute(
            f"""SELECT a.semaine_code, a.signal, COUNT(*) as cnt
                FROM analyses a
                WHERE a.semaine_code IN ({placeholders})
                  AND a.passe_finale != 0
                  AND a.signal IS NOT NULL
                GROUP BY a.semaine_code, a.signal""",
            window,
        ).fetchall()

    bucket: dict[str, dict[str, int]] = {s: {"MV": 0, "IV": 0, "SECU": 0} for s in window_sorted}
    for row in rows:
        sig = row["signal"]
        wk = row["semaine_code"]
        if wk in bucket and sig in bucket[wk]:
            bucket[wk][sig] = row["cnt"]

    series = {sig: [bucket[s][sig] for s in window_sorted] for sig in ("MV", "IV", "SECU")}
    top_clusters = get_top_clusters(semaine_code, weeks)
    return {
        "weekly_labels": window_sorted,
        "weekly_by_signal": series,
        "clusters": [c.model_dump() for c in top_clusters],
    }

import asyncio
import json
from functools import partial
from typing import Optional
import chromadb
from chromadb.utils import embedding_functions
from src.models import Ticket, AnalysisResult

_COLLECTION_NAME = "ticket_cache"
_DISTANCE_THRESHOLD = 0.08   # cosine distance ≤ 0.08 → ≥ 92% de similarité
_MIN_CONFIANCE_STORE = 0.80


def _ticket_text(ticket: Ticket) -> str:
    return " ".join(filter(None, [
        ticket.objet,
        ticket.description_anonyme or ticket.description,
        ticket.produit,
    ]))


class TicketCache:
    def __init__(self, chroma_path: str):
        ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )
        client = chromadb.PersistentClient(path=chroma_path)
        self._collection = client.get_or_create_collection(
            _COLLECTION_NAME,
            embedding_function=ef,
            metadata={"hnsw:space": "cosine"},
        )

    def _sync_lookup(self, text: str) -> Optional[AnalysisResult]:
        if self._collection.count() == 0:
            return None
        results = self._collection.query(
            query_texts=[text],
            n_results=1,
            include=["distances", "metadatas"],
        )
        if not results["distances"] or not results["distances"][0]:
            return None
        distance = results["distances"][0][0]
        if distance > _DISTANCE_THRESHOLD:
            return None
        meta = results["metadatas"][0][0]
        source_id = meta.get("ticket_id", "?")
        similarity_pct = (1.0 - distance) * 100
        return AnalysisResult(
            decision=meta["decision"],
            signal=meta.get("signal") or None,
            niveau=meta.get("niveau") or None,
            confiance=float(meta["confiance"]),
            raisonnement=(
                f"[Cache — {similarity_pct:.0f}% similaire au ticket {source_id}] "
                + meta.get("raisonnement", "")
            ),
            articles_cites=json.loads(meta.get("articles_cites", "[]")),
            capa_suggere=bool(meta.get("capa_suggere", 0)),
            mots_cles=json.loads(meta.get("mots_cles", "[]")),
            passe_finale=-1,
        )

    async def lookup(self, ticket: Ticket) -> Optional[AnalysisResult]:
        """Retourne un résultat caché si un ticket très similaire existe (non-bloquant)."""
        text = _ticket_text(ticket)
        if not text.strip():
            return None
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, partial(self._sync_lookup, text))

    def _sync_store(self, ticket_id: str, text: str, meta: dict) -> None:
        try:
            self._collection.upsert(
                documents=[text],
                ids=[ticket_id],
                metadatas=[meta],
            )
        except Exception:
            pass

    async def store(self, ticket: Ticket, result: AnalysisResult) -> None:
        """Indexe le ticket analysé pour les prochaines semaines (non-bloquant)."""
        if result.confiance < _MIN_CONFIANCE_STORE or result.passe_finale == -1:
            return
        text = _ticket_text(ticket)
        if not text.strip():
            return
        meta = {
            "ticket_id": str(ticket.id),
            "decision": result.decision,
            "signal": result.signal or "",
            "niveau": result.niveau or "",
            "confiance": result.confiance,
            "raisonnement": (result.raisonnement or "")[:400],
            "articles_cites": json.dumps(result.articles_cites),
            "capa_suggere": int(result.capa_suggere),
            "mots_cles": json.dumps(result.mots_cles),
        }
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, partial(self._sync_store, str(ticket.id), text, meta))

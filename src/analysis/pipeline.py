import json
import asyncio
from typing import List, Optional
from src.models import Ticket, AnalysisResult, DictionaryEntry, ExclusionRule
from src.analysis.ollama_client import OllamaClient
from src.analysis.rag import RegulatoryRAG
from src.analysis.ticket_cache import TicketCache
from src.analysis.prompts import (
    build_pass1_messages, build_pass2_messages, build_pass3_messages,
    ANALYSIS_JSON_SCHEMA,
)


def _matches_exclusion(ticket: Ticket, rule: ExclusionRule) -> bool:
    value = (getattr(ticket, rule.champ, None) or "").lower()
    target = rule.valeur.lower()
    if rule.operateur == "egal":
        return value == target
    if rule.operateur == "contient":
        return target in value
    if rule.operateur == "commence_par":
        return value.startswith(target)
    return False


def _matches_fort_pattern(ticket: Ticket, entry: DictionaryEntry) -> bool:
    """Vérifie si le pattern apparaît dans l'objet ou la description anonymisée."""
    haystack = " ".join(filter(None, [
        ticket.objet,
        ticket.description_anonyme or ticket.description,
    ])).lower()
    return entry.pattern.lower() in haystack


def _parse_result(raw: dict, passe: int) -> AnalysisResult:
    confiance = float(raw.get("confiance", 0.5))
    if confiance > 1.0:
        confiance = confiance / 100.0
    return AnalysisResult(
        decision=raw.get("decision", "SURVEILLER"),
        signal=raw.get("signal"),
        niveau=raw.get("niveau"),
        confiance=confiance,
        raisonnement=raw.get("raisonnement", ""),
        articles_cites=raw.get("articles_cites", []),
        capa_suggere=bool(raw.get("capa_suggere", False)),
        mots_cles=raw.get("mots_cles", []),
        passe_finale=passe,
    )


class AnalysisPipeline:
    def __init__(
        self,
        ollama: OllamaClient,
        rag: RegulatoryRAG,
        dictionary_entries: List[DictionaryEntry],
        exclusion_rules: Optional[List[ExclusionRule]] = None,
        threshold_clos: float = 0.85,
        threshold_escalate: float = 0.70,
        cache: Optional[TicketCache] = None,
    ):
        self.ollama = ollama
        self.rag = rag
        self.dictionary_entries = dictionary_entries
        self.exclusion_rules = [r for r in (exclusion_rules or []) if r.actif]
        self.threshold_clos = threshold_clos
        self.threshold_escalate = threshold_escalate
        self.cache = cache

    async def analyze(self, ticket: Ticket) -> AnalysisResult:
        # Pre-pass — exclusion rules (no LLM call)
        for rule in self.exclusion_rules:
            if _matches_exclusion(ticket, rule):
                return AnalysisResult(
                    decision="CLOS",
                    confiance=1.0,
                    raisonnement=f"Exclu automatiquement — {rule.raison}",
                    passe_finale=0,
                )

        # Pre-pass — patterns "fort" du dictionnaire (≥10 semaines validées, bypass LLM garanti)
        for entry in self.dictionary_entries:
            if entry.poids == "fort" and _matches_fort_pattern(ticket, entry):
                return AnalysisResult(
                    decision="ANALYSE_REQUISE",
                    signal=entry.signal,
                    niveau=entry.niveau,
                    confiance=1.0,
                    raisonnement=(
                        f"Pattern fort détecté : \"{entry.pattern}\" "
                        f"({entry.article or entry.signal}) — "
                        "classification déterministe, bypass LLM."
                    ),
                    articles_cites=[entry.article] if entry.article else [],
                    mots_cles=[entry.pattern],
                    passe_finale=0,
                )

        # Pre-pass — cache sémantique (ticket très similaire déjà analysé avec haute confiance)
        if self.cache:
            cached = await self.cache.lookup(ticket)
            if cached is not None:
                return cached

        # Pass 1 — fast triage
        msgs1 = build_pass1_messages(ticket, self.dictionary_entries)
        raw1 = await self.ollama.chat(msgs1, json_schema=ANALYSIS_JSON_SCHEMA)
        result1 = _parse_result(raw1, passe=1)

        if result1.decision == "CLOS" and result1.confiance >= self.threshold_clos:
            if self.cache:
                await self.cache.store(ticket, result1)
            return result1

        # Si Pass1 indique déjà une escalade claire, pas besoin d'aller plus loin
        if result1.decision == "ANALYSE_REQUISE" and result1.confiance >= 0.70:
            if self.cache:
                await self.cache.store(ticket, result1)
            return result1

        # Pass 2 — deep analysis with RAG
        query = f"{ticket.objet or ''} {ticket.description_anonyme or ''}"
        passages = self.rag.retrieve(query, k=3)
        msgs2 = build_pass2_messages(ticket, self.dictionary_entries, passages)
        raw2 = await self.ollama.chat(msgs2, json_schema=ANALYSIS_JSON_SCHEMA)
        result2 = _parse_result(raw2, passe=2)

        if result2.confiance >= self.threshold_escalate:
            if self.cache:
                await self.cache.store(ticket, result2)
            return result2

        # Pass 3 — auto-critique uniquement pour les CLOS à faible confiance (vérification sécurité)
        if result2.decision != "CLOS":
            if self.cache:
                await self.cache.store(ticket, result2)
            return result2

        prior_json = json.dumps(raw2, ensure_ascii=False)
        msgs3 = build_pass3_messages(ticket, prior_json)
        raw3 = await self.ollama.chat(msgs3, json_schema=ANALYSIS_JSON_SCHEMA)
        result3 = _parse_result(raw3, passe=3)
        if self.cache:
            await self.cache.store(ticket, result3)
        return result3

    async def analyze_batch(
        self,
        tickets: List[Ticket],
        concurrency: int = 6,
        progress_callback=None,
    ) -> List[Optional[AnalysisResult]]:
        results: List[Optional[AnalysisResult]] = [None] * len(tickets)
        sem = asyncio.Semaphore(concurrency)

        async def _worker(i: int, ticket: Ticket) -> None:
            async with sem:
                try:
                    results[i] = await self.analyze(ticket)
                except Exception:
                    results[i] = None
            if progress_callback:
                progress_callback(i + 1, len(tickets))

        await asyncio.gather(*[_worker(i, t) for i, t in enumerate(tickets)])
        return results

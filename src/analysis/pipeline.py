import json
import asyncio
from typing import List
from src.models import Ticket, AnalysisResult, DictionaryEntry
from src.analysis.ollama_client import OllamaClient
from src.analysis.rag import RegulatoryRAG
from src.analysis.prompts import (
    build_pass1_messages, build_pass2_messages, build_pass3_messages,
    ANALYSIS_JSON_SCHEMA,
)


def _parse_result(raw: dict, passe: int) -> AnalysisResult:
    return AnalysisResult(
        decision=raw.get("decision", "SURVEILLER"),
        signal=raw.get("signal"),
        niveau=raw.get("niveau"),
        confiance=float(raw.get("confiance", 0.5)),
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
        threshold_clos: float = 0.85,
        threshold_escalate: float = 0.70,
    ):
        self.ollama = ollama
        self.rag = rag
        self.dictionary_entries = dictionary_entries
        self.threshold_clos = threshold_clos
        self.threshold_escalate = threshold_escalate

    async def analyze(self, ticket: Ticket) -> AnalysisResult:
        # Pass 1 — fast triage
        msgs1 = build_pass1_messages(ticket, self.dictionary_entries)
        raw1 = await self.ollama.chat(msgs1, json_schema=ANALYSIS_JSON_SCHEMA)
        result1 = _parse_result(raw1, passe=1)

        if result1.decision == "CLOS" and result1.confiance >= self.threshold_clos:
            return result1

        # Pass 2 — deep analysis with RAG
        query = f"{ticket.objet or ''} {ticket.description_anonyme or ''}"
        passages = self.rag.retrieve(query, k=3)
        msgs2 = build_pass2_messages(ticket, self.dictionary_entries, passages)
        raw2 = await self.ollama.chat(msgs2, json_schema=ANALYSIS_JSON_SCHEMA)
        result2 = _parse_result(raw2, passe=2)

        if result2.confiance >= self.threshold_escalate:
            return result2

        # Pass 3 — self-critique on most ambiguous cases
        prior_json = json.dumps(raw2, ensure_ascii=False)
        msgs3 = build_pass3_messages(ticket, prior_json)
        raw3 = await self.ollama.chat(msgs3, json_schema=ANALYSIS_JSON_SCHEMA)
        return _parse_result(raw3, passe=3)

    async def analyze_batch(
        self,
        tickets: List[Ticket],
        progress_callback=None,
    ) -> List[AnalysisResult]:
        results = []
        for i, ticket in enumerate(tickets):
            result = await self.analyze(ticket)
            results.append(result)
            if progress_callback:
                progress_callback(i + 1, len(tickets))
        return results

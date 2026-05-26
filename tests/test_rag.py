import pytest
from pathlib import Path
from src.analysis.rag import RegulatoryRAG


def test_rag_empty_corpus_returns_empty(tmp_path):
    rag = RegulatoryRAG(
        chroma_path=str(tmp_path / "chroma"),
        regulatory_path=str(tmp_path / "reg")
    )
    results = rag.retrieve("surdosage médicament MDR", k=3)
    assert results == []


def test_rag_indexes_and_retrieves_text(tmp_path):
    reg_dir = tmp_path / "reg"
    reg_dir.mkdir()
    (reg_dir / "test.txt").write_text(
        "MDR Article 87 : tout incident grave doit être signalé sous 15 jours.",
        encoding="utf-8"
    )
    rag = RegulatoryRAG(
        chroma_path=str(tmp_path / "chroma"),
        regulatory_path=str(reg_dir)
    )
    rag.build_index()
    results = rag.retrieve("incident grave signalement", k=1)
    assert len(results) == 1
    assert "incident grave" in results[0].lower()

import re
from pathlib import Path
from typing import List
import chromadb
from chromadb.utils import embedding_functions


_CHUNK_SIZE = 500
_CHUNK_OVERLAP = 50
_COLLECTION_NAME = "regulatory"


def _chunk_text(text: str, size: int = _CHUNK_SIZE, overlap: int = _CHUNK_OVERLAP) -> List[str]:
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + size])
        chunks.append(chunk)
        i += size - overlap
    return [c for c in chunks if c.strip()]


class RegulatoryRAG:
    def __init__(self, chroma_path: str, regulatory_path: str):
        self.regulatory_path = Path(regulatory_path)
        self._ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        )
        self._client = chromadb.PersistentClient(path=chroma_path)
        self._collection = self._client.get_or_create_collection(
            _COLLECTION_NAME, embedding_function=self._ef
        )

    def build_index(self) -> int:
        if not self.regulatory_path.exists():
            return 0
        existing_ids = set(self._collection.get()["ids"])
        docs, ids, metas = [], [], []
        for f in self.regulatory_path.rglob("*"):
            if f.suffix == ".txt":
                text = f.read_text(encoding="utf-8", errors="replace")
            elif f.suffix == ".pdf":
                text = _extract_pdf_text(f)
            else:
                continue
            for i, chunk in enumerate(_chunk_text(text)):
                doc_id = f"{f.stem}_{i}"
                if doc_id not in existing_ids:
                    docs.append(chunk)
                    ids.append(doc_id)
                    metas.append({"source": f.name, "id": doc_id})
        if docs:
            self._collection.add(documents=docs, ids=ids, metadatas=metas)
        return len(docs)

    def retrieve(self, query: str, k: int = 3) -> List[str]:
        count = self._collection.count()
        if count == 0:
            return []
        results = self._collection.query(
            query_texts=[query],
            n_results=min(k, count),
        )
        return results["documents"][0] if results["documents"] else []


def _extract_pdf_text(path: Path) -> str:
    try:
        import pypdf
        reader = pypdf.PdfReader(str(path))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        return ""

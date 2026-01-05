from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/owl", tags=["owl"])


class SearchDocsRequest(BaseModel):
    query: str
    limit: Optional[int] = 8


def _doc_root() -> Path:
    backend_root = Path(__file__).resolve().parents[2]
    return backend_root.parent


def _list_doc_files() -> list[Path]:
    root = _doc_root()
    docs_dir = root / "docs"
    files: list[Path] = []
    for path in (root / "README.md", root / "Agents.md", root / "sdk" / "README.md"):
        if path.exists():
            files.append(path)
    if docs_dir.exists():
        files.extend(docs_dir.rglob("*.md"))
    return files


def _search_docs(query: str, limit: int) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    root = _doc_root()
    query_lower = query.lower()
    for path in _list_doc_files():
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for idx, line in enumerate(content.splitlines(), start=1):
            if query_lower in line.lower():
                results.append(
                    {
                        "path": str(path.relative_to(root)).replace("\\", "/"),
                        "line": idx,
                        "snippet": line.strip(),
                    }
                )
                if len(results) >= limit:
                    return results
    return results


@router.post("/search-docs")
async def search_docs(payload: SearchDocsRequest) -> dict[str, Any]:
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    limit = max(1, min(payload.limit or 8, 50))
    results = _search_docs(query, limit)
    return {"query": query, "count": len(results), "results": results}

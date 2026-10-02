"""Search the repository's Markdown documentation for exact text matches."""

from __future__ import annotations

from pathlib import Path
from typing import TypedDict


class DocumentationSearchResult(TypedDict):
    path: str
    line: int
    snippet: str


def _repository_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _documentation_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in (root / "README.md", root / "Agents.md", root / "sdk" / "README.md"):
        if path.exists():
            files.append(path)

    docs_directory = root / "docs"
    if docs_directory.exists():
        files.extend(docs_directory.rglob("*.md"))
    return files


def search_documentation(query: str, limit: int) -> list[DocumentationSearchResult]:
    """Return the first matching documentation lines, in repository scan order."""
    if limit <= 0:
        return []

    root = _repository_root()
    query_lower = query.lower()
    results: list[DocumentationSearchResult] = []
    for path in _documentation_files(root):
        try:
            content = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        for line_number, line in enumerate(content.splitlines(), start=1):
            if query_lower not in line.lower():
                continue
            results.append(
                {
                    "path": path.relative_to(root).as_posix(),
                    "line": line_number,
                    "snippet": line.strip(),
                }
            )
            if len(results) >= limit:
                return results
    return results

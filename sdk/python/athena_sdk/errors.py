from __future__ import annotations

from typing import Optional


class AthenaClientError(RuntimeError):
    def __init__(self, message: str, status: Optional[int] = None) -> None:
        super().__init__(message)
        self.status = status

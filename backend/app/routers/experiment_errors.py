import logging
from typing import NoReturn

from fastapi import HTTPException


logger = logging.getLogger("app.routers.experiments")


def raise_internal_error(operation: str, error: Exception) -> NoReturn:
    logger.error("%s failed with %s", operation, type(error).__name__)
    raise HTTPException(
        status_code=500,
        detail=f"{operation} failed.",
    ) from error

from __future__ import annotations

import base64
import hashlib
import secrets
import time
import uuid
from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import APIRouter, Depends, Form, Header, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import McpAuthCodeModel, McpTokenModel

oauth_router = APIRouter(prefix="/mcp", tags=["mcp"])
AUTH_CODE_TTL_MS = 10 * 60 * 1000
TOKEN_TTL_SECONDS = 60 * 60


def _hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _verify_pkce(verifier: str, challenge: str, method: str) -> bool:
    if method == "plain":
        return verifier == challenge
    if method == "S256":
        return _pkce_challenge(verifier) == challenge
    return False


def _append_query_params(url: str, params: dict[str, str]) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query))
    query.update(params)
    return urlunparse(parsed._replace(query=urlencode(query)))


async def _require_mcp_token(
    authorization: Optional[str] = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> McpTokenModel:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing MCP access token")
    raw = authorization.split(" ", 1)[1].strip()
    token_hash = _hash_value(raw)
    stmt = select(McpTokenModel).where(McpTokenModel.token_hash == token_hash)
    res = await session.execute(stmt)
    token = res.scalar_one_or_none()
    if not token:
        raise HTTPException(status_code=401, detail="Invalid MCP access token")
    now = int(time.time() * 1000)
    if token.revoked_at:
        raise HTTPException(status_code=401, detail="MCP access token revoked")
    if token.expires_at and token.expires_at < now:
        raise HTTPException(status_code=401, detail="MCP access token expired")
    token.last_used_at = now
    session.add(token)
    await session.commit()
    return token


@oauth_router.get("/.well-known/oauth-authorization-server")
async def oauth_metadata(request: Request) -> dict[str, Any]:
    base_url = str(request.base_url).rstrip("/")
    return {
        "issuer": base_url,
        "authorization_endpoint": f"{base_url}/mcp/oauth/authorize",
        "token_endpoint": f"{base_url}/mcp/oauth/token",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code"],
        "code_challenge_methods_supported": ["S256", "plain"],
        "token_endpoint_auth_methods_supported": ["none"],
    }


@oauth_router.get("/oauth/authorize")
async def oauth_authorize(
    response_type: str,
    client_id: str,
    redirect_uri: str,
    code_challenge: str,
    code_challenge_method: str = "S256",
    state: Optional[str] = None,
    project_id: Optional[str] = None,
    org_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    if response_type != "code":
        raise HTTPException(status_code=400, detail="Unsupported response_type")
    if code_challenge_method not in {"S256", "plain"}:
        raise HTTPException(status_code=400, detail="Unsupported code_challenge_method")

    code = secrets.token_urlsafe(32)
    code_hash = _hash_value(code)
    now = int(time.time() * 1000)
    entry = McpAuthCodeModel(
        id=f"mcp_code_{uuid.uuid4().hex[:10]}",
        client_id=client_id,
        redirect_uri=redirect_uri,
        code_hash=code_hash,
        code_challenge=code_challenge,
        code_challenge_method=code_challenge_method,
        org_id=org_id,
        project_id=project_id,
        created_at=now,
        expires_at=now + AUTH_CODE_TTL_MS,
    )
    session.add(entry)
    await session.commit()

    params = {"code": code}
    if state:
        params["state"] = state
    redirect = _append_query_params(redirect_uri, params)
    return RedirectResponse(redirect)


@oauth_router.post("/oauth/token")
async def oauth_token(
    grant_type: str = Form(...),
    code: str = Form(...),
    redirect_uri: str = Form(...),
    client_id: str = Form(...),
    code_verifier: str = Form(...),
    session: AsyncSession = Depends(get_session),
):
    if grant_type != "authorization_code":
        raise HTTPException(status_code=400, detail="Unsupported grant_type")

    code_hash = _hash_value(code)
    stmt = select(McpAuthCodeModel).where(McpAuthCodeModel.code_hash == code_hash)
    res = await session.execute(stmt)
    auth_code = res.scalar_one_or_none()
    if not auth_code:
        raise HTTPException(status_code=400, detail="Invalid authorization code")

    now = int(time.time() * 1000)
    if auth_code.consumed_at:
        raise HTTPException(status_code=400, detail="Authorization code already used")
    if auth_code.expires_at < now:
        raise HTTPException(status_code=400, detail="Authorization code expired")
    if auth_code.redirect_uri != redirect_uri:
        raise HTTPException(status_code=400, detail="redirect_uri mismatch")
    if auth_code.client_id != client_id:
        raise HTTPException(status_code=400, detail="client_id mismatch")

    if not _verify_pkce(code_verifier, auth_code.code_challenge, auth_code.code_challenge_method):
        raise HTTPException(status_code=400, detail="Invalid code_verifier")

    auth_code.consumed_at = now
    session.add(auth_code)

    token = secrets.token_urlsafe(32)
    token_hash = _hash_value(token)
    token_entry = McpTokenModel(
        id=f"mcp_token_{uuid.uuid4().hex[:10]}",
        client_id=client_id,
        token_hash=token_hash,
        token_last4=token[-4:],
        org_id=auth_code.org_id,
        project_id=auth_code.project_id,
        created_at=now,
        expires_at=now + (TOKEN_TTL_SECONDS * 1000),
    )
    session.add(token_entry)
    await session.commit()

    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": TOKEN_TTL_SECONDS,
    }

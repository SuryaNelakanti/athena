from __future__ import annotations

from pathlib import Path
from typing import Any, Optional, List
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
import base64
import hashlib
import secrets
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException, Header, Request, Form
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.database import get_session
from app.models import (
    McpAuthCodeModel,
    McpTokenModel,
    Project,
    DatasetModel,
    DatasetRowModel,
    ExperimentModel,
    ExperimentRunModel,
    ExperimentVersionModel,
    FunctionModel,
    ShareLinkModel,
    LogModel,
    TraceModel,
    ViewModel,
)
from app.services.aql_service import AQLService, AQLParseError
from app.services.dataset_service import DatasetService

router = APIRouter(prefix="/mcp", tags=["mcp"])

AUTH_CODE_TTL_MS = 10 * 60 * 1000
TOKEN_TTL_SECONDS = 60 * 60


class SearchDocsRequest(BaseModel):
    query: str
    limit: Optional[int] = 8


class ResolveObjectRequest(BaseModel):
    object_type: str
    name_or_id: str
    project_id: Optional[str] = None
    include_permalink: Optional[bool] = False


class ListRecentObjectsRequest(BaseModel):
    object_types: Optional[List[str]] = None
    project_id: Optional[str] = None
    limit: Optional[int] = 10


class InferSchemaRequest(BaseModel):
    dataset_id: Optional[str] = None
    aql_query: Optional[str] = None
    limit: Optional[int] = 5


class AqlQueryRequest(BaseModel):
    query: str


class SummarizeExperimentRequest(BaseModel):
    experiment_id: Optional[str] = None
    version_id: Optional[str] = None
    run_id: Optional[str] = None


class GeneratePermalinkRequest(BaseModel):
    object_type: str
    object_id: str
    project_id: Optional[str] = None
    org_id: Optional[str] = None
    expires_in: Optional[int] = None


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


async def _create_share_link(
    session: AsyncSession,
    object_type: str,
    object_id: str,
    project_id: Optional[str],
    org_id: Optional[str],
    expires_in: Optional[int],
) -> ShareLinkModel:
    now = int(time.time() * 1000)
    expires_at = now + (expires_in * 1000) if expires_in else None
    token = uuid.uuid4().hex[:12]
    link = ShareLinkModel(
        id=f"sh_{uuid.uuid4().hex[:10]}",
        token=token,
        org_id=org_id,
        project_id=project_id,
        object_type=object_type,
        object_id=object_id,
        expires_at=expires_at,
        created_at=now,
    )
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link


@router.get("/.well-known/oauth-authorization-server")
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


@router.get("/oauth/authorize")
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


@router.post("/oauth/token")
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


@router.get("/tools")
async def list_tools(_: McpTokenModel = Depends(_require_mcp_token)) -> dict[str, Any]:
    return {
        "tools": [
            "search_docs",
            "resolve_object",
            "list_recent_objects",
            "infer_schema",
            "aql_query",
            "summarize_experiment",
            "generate_permalink",
        ]
    }


@router.post("/tools/search_docs")
async def search_docs(
    payload: SearchDocsRequest,
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    limit = max(1, min(payload.limit or 8, 50))
    results = _search_docs(query, limit)
    return {"query": query, "count": len(results), "results": results}


@router.post("/tools/resolve_object")
async def resolve_object(
    payload: ResolveObjectRequest,
    session: AsyncSession = Depends(get_session),
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    obj_type = payload.object_type
    name_or_id = payload.name_or_id
    project_id = payload.project_id

    resolver_map: dict[str, tuple[Any, Optional[str]]] = {
        "project": (Project, "name"),
        "dataset": (DatasetModel, "name"),
        "experiment": (ExperimentModel, "name"),
        "function": (FunctionModel, "name"),
        "view": (ViewModel, "name"),
        "log": (LogModel, None),
        "trace": (TraceModel, None),
        "experiment_run": (ExperimentRunModel, None),
        "experiment_version": (ExperimentVersionModel, None),
        "dataset_row": (DatasetRowModel, None),
    }
    if obj_type not in resolver_map:
        raise HTTPException(status_code=400, detail="Unsupported object_type")

    model, name_field = resolver_map[obj_type]
    obj = await session.get(model, name_or_id)
    if not obj and name_field:
        field = getattr(model, name_field)
        stmt = select(model).where(field == name_or_id)
        if project_id and hasattr(model, "project_id"):
            stmt = stmt.where(model.project_id == project_id)
        res = await session.execute(stmt)
        obj = res.scalar_one_or_none()

    if not obj:
        raise HTTPException(status_code=404, detail="Object not found")

    permalink = None
    if payload.include_permalink:
        link = await _create_share_link(
            session=session,
            object_type=obj_type,
            object_id=obj.id,
            project_id=getattr(obj, "project_id", project_id),
            org_id=getattr(obj, "org_id", None),
            expires_in=None,
        )
        permalink = f"/share-links/{link.token}"

    return {
        "object_type": obj_type,
        "id": obj.id,
        "name": getattr(obj, "name", None),
        "project_id": getattr(obj, "project_id", None),
        "permalink": permalink,
    }


@router.post("/tools/list_recent_objects")
async def list_recent_objects(
    payload: ListRecentObjectsRequest,
    session: AsyncSession = Depends(get_session),
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    object_types = payload.object_types or ["project", "dataset", "experiment", "function"]
    limit = max(1, min(payload.limit or 10, 50))
    results: list[dict[str, Any]] = []

    async def _add_results(obj_type: str, model: Any, name_field: Optional[str]) -> None:
        stmt = select(model)
        if payload.project_id and hasattr(model, "project_id"):
            stmt = stmt.where(model.project_id == payload.project_id)
        if hasattr(model, "created_at"):
            stmt = stmt.order_by(model.created_at.desc())
        elif name_field:
            stmt = stmt.order_by(getattr(model, name_field))
        stmt = stmt.limit(limit)
        res = await session.execute(stmt)
        for obj in res.scalars().all():
            results.append(
                {
                    "object_type": obj_type,
                    "id": obj.id,
                    "name": getattr(obj, "name", None),
                    "project_id": getattr(obj, "project_id", None),
                    "created_at": getattr(obj, "created_at", None),
                }
            )

    mapping: dict[str, tuple[Any, Optional[str]]] = {
        "project": (Project, "name"),
        "dataset": (DatasetModel, "name"),
        "experiment": (ExperimentModel, "name"),
        "function": (FunctionModel, "name"),
        "view": (ViewModel, "name"),
    }
    for obj_type in object_types:
        if obj_type not in mapping:
            continue
        model, name_field = mapping[obj_type]
        await _add_results(obj_type, model, name_field)

    return {"count": len(results), "results": results}


@router.post("/tools/infer_schema")
async def infer_schema(
    payload: InferSchemaRequest,
    session: AsyncSession = Depends(get_session),
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    limit = max(1, min(payload.limit or 5, 50))
    if payload.dataset_id:
        dataset_service = DatasetService(session)
        rows = await dataset_service.list_rows(payload.dataset_id)
        sample = rows[:limit]
        schema_fields: set[str] = {
            "row_kind",
            "eval_label",
            "example_type",
            "source_trace_id",
        }
        for row in sample:
            if isinstance(row.input, dict):
                for key in row.input.keys():
                    schema_fields.add(f"input.{key}")
            if isinstance(row.expected, dict):
                for key in row.expected.keys():
                    schema_fields.add(f"expected.{key}")
            if isinstance(row.meta, dict):
                for key in row.meta.keys():
                    schema_fields.add(f"meta.{key}")
        return {
            "source": "dataset",
            "dataset_id": payload.dataset_id,
            "schema": sorted(schema_fields),
            "sample_rows": [
                {"input": row.input, "expected": row.expected, "meta": row.meta} for row in sample
            ],
        }

    if payload.aql_query:
        service = AQLService()
        try:
            parsed = service.parse(payload.aql_query)
            parsed.limit = parsed.limit or limit
            result = await service.execute(session, parsed)
            return {
                "source": "aql",
                "schema": result.get("schema", []),
                "rows": result.get("rows", [])[:limit],
            }
        except AQLParseError as e:
            raise HTTPException(status_code=400, detail=str(e))

    raise HTTPException(status_code=400, detail="dataset_id or aql_query is required")


@router.post("/tools/aql_query")
async def aql_query(
    payload: AqlQueryRequest,
    session: AsyncSession = Depends(get_session),
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    service = AQLService()
    try:
        parsed = service.parse(payload.query)
        result = await service.execute(session, parsed)
        result["query"] = payload.query
        return result
    except AQLParseError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tools/summarize_experiment")
async def summarize_experiment(
    payload: SummarizeExperimentRequest,
    session: AsyncSession = Depends(get_session),
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    run: Optional[ExperimentRunModel] = None
    if payload.run_id:
        run = await session.get(ExperimentRunModel, payload.run_id)
    elif payload.version_id:
        stmt = (
            select(ExperimentRunModel)
            .where(ExperimentRunModel.experiment_version_id == payload.version_id)
            .order_by(ExperimentRunModel.created_at.desc())
            .limit(1)
        )
        res = await session.execute(stmt)
        run = res.scalar_one_or_none()
    elif payload.experiment_id:
        stmt = (
            select(ExperimentRunModel)
            .join(ExperimentVersionModel, ExperimentRunModel.experiment_version_id == ExperimentVersionModel.id)
            .where(ExperimentVersionModel.experiment_id == payload.experiment_id)
            .order_by(ExperimentRunModel.created_at.desc())
            .limit(1)
        )
        res = await session.execute(stmt)
        run = res.scalar_one_or_none()

    if not run:
        raise HTTPException(status_code=404, detail="Experiment run not found")

    version = await session.get(ExperimentVersionModel, run.experiment_version_id)
    experiment_id = version.experiment_id if version else None

    return {
        "experiment_id": experiment_id,
        "version_id": run.experiment_version_id,
        "run_id": run.id,
        "status": run.status,
        "summary": run.summary or {},
        "created_at": run.created_at,
        "completed_at": run.completed_at,
    }


@router.post("/tools/generate_permalink")
async def generate_permalink(
    payload: GeneratePermalinkRequest,
    session: AsyncSession = Depends(get_session),
    _: McpTokenModel = Depends(_require_mcp_token),
) -> dict[str, Any]:
    link = await _create_share_link(
        session=session,
        object_type=payload.object_type,
        object_id=payload.object_id,
        project_id=payload.project_id,
        org_id=payload.org_id,
        expires_in=payload.expires_in,
    )
    return {
        "token": link.token,
        "permalink": f"/share-links/{link.token}",
        "expires_at": link.expires_at,
    }

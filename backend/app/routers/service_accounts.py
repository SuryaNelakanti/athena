from typing import List, Optional
import hashlib
import secrets
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..database import get_session
from ..models import ServiceAccountModel, ServiceTokenModel

router = APIRouter(prefix="/service-accounts", tags=["service-accounts"])


class ServiceAccountCreate(BaseModel):
    org_id: str
    name: str
    description: Optional[str] = None


class ServiceAccountUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ServiceTokenCreate(BaseModel):
    name: Optional[str] = None


class ServiceTokenResponse(BaseModel):
    id: str
    service_account_id: str
    name: Optional[str] = None
    token_last4: Optional[str] = None
    created_at: int
    last_used_at: Optional[int] = None
    revoked_at: Optional[int] = None

    class Config:
        from_attributes = True


class ServiceTokenCreateResponse(ServiceTokenResponse):
    token: str


@router.get("/", response_model=List[ServiceAccountModel])
async def list_service_accounts(
    org_id: Optional[str] = None,
    include_revoked: bool = False,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(ServiceAccountModel)
    if org_id:
        stmt = stmt.where(ServiceAccountModel.org_id == org_id)
    if not include_revoked:
        stmt = stmt.where(ServiceAccountModel.revoked_at == None)  # noqa: E711
    stmt = stmt.order_by(ServiceAccountModel.created_at.desc())
    res = await session.execute(stmt)
    return res.scalars().all()


@router.get("/{service_account_id}", response_model=ServiceAccountModel)
async def get_service_account(
    service_account_id: str,
    session: AsyncSession = Depends(get_session),
):
    account = await session.get(ServiceAccountModel, service_account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Service account not found")
    return account


@router.post("/", response_model=ServiceAccountModel)
async def create_service_account(
    payload: ServiceAccountCreate,
    session: AsyncSession = Depends(get_session),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    now_ms = int(time.time() * 1000)
    account = ServiceAccountModel(
        id=f"sac_{uuid.uuid4().hex[:10]}",
        org_id=payload.org_id,
        name=name,
        description=payload.description,
        created_at=now_ms,
        updated_at=now_ms,
    )
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


@router.patch("/{service_account_id}", response_model=ServiceAccountModel)
async def update_service_account(
    service_account_id: str,
    payload: ServiceAccountUpdate,
    session: AsyncSession = Depends(get_session),
):
    account = await session.get(ServiceAccountModel, service_account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Service account not found")

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="name cannot be empty")
        account.name = name
    if payload.description is not None:
        account.description = payload.description

    account.updated_at = int(time.time() * 1000)
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


@router.delete("/{service_account_id}")
async def revoke_service_account(
    service_account_id: str,
    session: AsyncSession = Depends(get_session),
):
    account = await session.get(ServiceAccountModel, service_account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Service account not found")
    account.revoked_at = int(time.time() * 1000)
    account.updated_at = int(time.time() * 1000)
    session.add(account)
    await session.commit()
    return {"status": "success"}


@router.get("/{service_account_id}/tokens", response_model=List[ServiceTokenResponse])
async def list_service_tokens(
    service_account_id: str,
    include_revoked: bool = False,
    session: AsyncSession = Depends(get_session),
):
    stmt = select(ServiceTokenModel).where(ServiceTokenModel.service_account_id == service_account_id)
    if not include_revoked:
        stmt = stmt.where(ServiceTokenModel.revoked_at == None)  # noqa: E711
    stmt = stmt.order_by(ServiceTokenModel.created_at.desc())
    res = await session.execute(stmt)
    return res.scalars().all()


@router.post("/{service_account_id}/tokens", response_model=ServiceTokenCreateResponse)
async def create_service_token(
    service_account_id: str,
    payload: ServiceTokenCreate,
    session: AsyncSession = Depends(get_session),
):
    account = await session.get(ServiceAccountModel, service_account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Service account not found")
    if account.revoked_at:
        raise HTTPException(status_code=400, detail="Service account is revoked")

    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    now_ms = int(time.time() * 1000)
    token = ServiceTokenModel(
        id=f"stk_{uuid.uuid4().hex[:10]}",
        service_account_id=service_account_id,
        name=payload.name,
        token_hash=token_hash,
        token_last4=raw_token[-4:],
        created_at=now_ms,
    )
    session.add(token)
    await session.commit()
    await session.refresh(token)

    return ServiceTokenCreateResponse(
        id=token.id,
        service_account_id=token.service_account_id,
        name=token.name,
        token_last4=token.token_last4,
        created_at=token.created_at,
        last_used_at=token.last_used_at,
        revoked_at=token.revoked_at,
        token=raw_token,
    )


@router.delete("/tokens/{token_id}")
async def revoke_service_token(
    token_id: str,
    session: AsyncSession = Depends(get_session),
):
    token = await session.get(ServiceTokenModel, token_id)
    if not token:
        raise HTTPException(status_code=404, detail="Service token not found")
    token.revoked_at = int(time.time() * 1000)
    session.add(token)
    await session.commit()
    return {"status": "success"}

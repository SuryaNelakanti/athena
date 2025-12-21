from __future__ import annotations

from typing import Optional
import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import JobModel


class JobService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_job(
        self,
        kind: str,
        ref_id: str,
        max_attempts: int = 3,
        payload: Optional[dict] = None,
    ) -> JobModel:
        job = JobModel(
            id=f"job_{uuid.uuid4().hex[:10]}",
            kind=kind,
            ref_id=ref_id,
            status="queued",
            attempts=0,
            max_attempts=max_attempts,
            payload=payload or {},
            created_at=int(time.time() * 1000),
            updated_at=int(time.time() * 1000),
        )
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        return job

    async def claim_next_job(
        self,
        kind: Optional[str] = None,
        lock_timeout_ms: int = 10 * 60 * 1000,
    ) -> Optional[JobModel]:
        now_ms = int(time.time() * 1000)
        lock_expired_before = now_ms - lock_timeout_ms

        stmt = select(JobModel).where(
            (
                (JobModel.status == "queued")
                | (
                    (JobModel.status == "running")
                    & ((JobModel.locked_at == None) | (JobModel.locked_at < lock_expired_before))
                )
            ),
            JobModel.attempts < JobModel.max_attempts,
        )
        if kind:
            stmt = stmt.where(JobModel.kind == kind)

        stmt = stmt.order_by(JobModel.created_at.asc()).limit(1)
        res = await self.session.execute(stmt)
        job = res.scalar_one_or_none()

        if not job:
            return None

        job.status = "running"
        job.locked_at = now_ms
        job.started_at = now_ms
        job.attempts = int(job.attempts or 0) + 1
        job.updated_at = now_ms
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        return job

    async def claim_job(self, job_id: str, lock_timeout_ms: int = 10 * 60 * 1000) -> Optional[JobModel]:
        job = await self.session.get(JobModel, job_id)
        if not job:
            return None

        now_ms = int(time.time() * 1000)
        lock_expired_before = now_ms - lock_timeout_ms
        if int(job.attempts or 0) >= int(job.max_attempts or 0):
            return None
        if job.status == "running":
            if job.locked_at and job.locked_at > lock_expired_before:
                return None
        elif job.status != "queued":
            return None
        elif job.locked_at and job.locked_at > lock_expired_before:
            return None

        job.status = "running"
        job.locked_at = now_ms
        job.started_at = now_ms
        job.attempts = int(job.attempts or 0) + 1
        job.updated_at = now_ms
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        return job

    async def complete_job(self, job: JobModel, status: str, error: Optional[str] = None) -> JobModel:
        now_ms = int(time.time() * 1000)
        job.status = status
        job.completed_at = now_ms
        job.updated_at = now_ms
        job.last_error = error
        self.session.add(job)
        await self.session.commit()
        await self.session.refresh(job)
        return job

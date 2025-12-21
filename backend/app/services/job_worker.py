from __future__ import annotations

from typing import Optional
import time
import traceback

from app.database import async_sessionmaker
from app.models import JobModel, ExperimentRunModel
from app.services.experiment_v2_service import ExperimentV2Service
from app.services.job_service import JobService


class JobWorker:
    @staticmethod
    async def process_job(job_id: str, claim: bool = True) -> None:
        async with async_sessionmaker() as session:
            service = JobService(session)
            job = await service.claim_job(job_id) if claim else await session.get(JobModel, job_id)
            if not job:
                return

        error: Optional[str] = None
        try:
            if job.kind == "experiment_run":
                await ExperimentV2Service.execute_run(job.ref_id)
            else:
                error = f"Unsupported job kind: {job.kind}"
        except Exception:
            error = traceback.format_exc()

        async with async_sessionmaker() as session:
            service = JobService(session)
            job = await session.get(JobModel, job_id)
            if not job:
                return
            if error and job.kind == "experiment_run":
                run = await session.get(ExperimentRunModel, job.ref_id)
                if run:
                    run.status = "error"
                    run.summary = {**(run.summary or {}), "error": error}
                    run.completed_at = int(time.time() * 1000)
                    session.add(run)
            if error:
                await service.complete_job(job, status="error", error=error)
            else:
                await service.complete_job(job, status="completed")

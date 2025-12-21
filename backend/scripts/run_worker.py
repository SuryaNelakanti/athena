import asyncio

from app.database import async_sessionmaker
from app.services.job_service import JobService
from app.services.job_worker import JobWorker


async def run_loop(poll_interval: float = 1.0) -> None:
    while True:
        async with async_sessionmaker() as session:
            service = JobService(session)
            job = await service.claim_next_job(kind="experiment_run")

        if not job:
            await asyncio.sleep(poll_interval)
            continue

        await JobWorker.process_job(job.id, claim=False)


if __name__ == "__main__":
    asyncio.run(run_loop())

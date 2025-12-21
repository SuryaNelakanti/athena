from __future__ import annotations

from typing import Any, Optional
import time
import uuid

from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from app.models import DatasetModel, DatasetRowModel, DatasetVersionModel


class DatasetService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_dataset(self, dataset_id: str) -> DatasetModel:
        dataset = await self.session.get(DatasetModel, dataset_id)
        if not dataset:
            raise ValueError("Dataset not found")
        return dataset

    async def _get_last_flush_version(self, dataset_id: str, at_version: Optional[int]) -> Optional[int]:
        stmt = select(func.max(DatasetVersionModel.version)).where(
            DatasetVersionModel.dataset_id == dataset_id,
            DatasetVersionModel.action == "flush",
        )
        if at_version is not None:
            stmt = stmt.where(DatasetVersionModel.version <= at_version)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def _latest_row_for_logical_id(self, dataset_id: str, logical_id: str) -> Optional[DatasetRowModel]:
        stmt = (
            select(DatasetRowModel)
            .where(DatasetRowModel.dataset_id == dataset_id, DatasetRowModel.logical_id == logical_id)
            .order_by(DatasetRowModel.version.desc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def _next_dataset_version(self, dataset: DatasetModel) -> int:
        dataset.version = int(dataset.version or 0) + 1
        self.session.add(dataset)
        return dataset.version

    async def _record_dataset_version(
        self,
        dataset: DatasetModel,
        action: str,
        logical_id: Optional[str] = None,
        row_id: Optional[str] = None,
        meta: Optional[dict[str, Any]] = None,
    ) -> DatasetVersionModel:
        entry = DatasetVersionModel(
            id=f"dv_{uuid.uuid4().hex[:10]}",
            dataset_id=dataset.id,
            version=int(dataset.version),
            action=action,
            logical_id=logical_id,
            row_id=row_id,
            meta=meta or {},
            created_at=int(time.time() * 1000),
        )
        self.session.add(entry)
        return entry

    async def list_rows(self, dataset_id: str, at_version: Optional[int] = None) -> list[DatasetRowModel]:
        dataset = await self.get_dataset(dataset_id)
        effective_version = at_version if at_version is not None else dataset.version
        last_flush_version = await self._get_last_flush_version(dataset_id, effective_version)

        subquery = (
            select(
                DatasetRowModel.logical_id,
                func.max(DatasetRowModel.version).label("max_version"),
            )
            .where(DatasetRowModel.dataset_id == dataset_id)
        )

        if at_version is not None:
            subquery = subquery.where(DatasetRowModel.dataset_version <= at_version)

        if last_flush_version is not None:
            subquery = subquery.where(DatasetRowModel.dataset_version > last_flush_version)

        subquery = subquery.group_by(DatasetRowModel.logical_id).subquery()

        stmt = (
            select(DatasetRowModel)
            .where(DatasetRowModel.dataset_id == dataset_id)
            .where(DatasetRowModel.is_deleted == False)
            .join(
                subquery,
                (DatasetRowModel.logical_id == subquery.c.logical_id)
                & (DatasetRowModel.version == subquery.c.max_version),
            )
            .order_by(DatasetRowModel.created_at.desc())
        )

        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def list_row_history(self, dataset_id: str, logical_id: str) -> list[DatasetRowModel]:
        stmt = (
            select(DatasetRowModel)
            .where(DatasetRowModel.dataset_id == dataset_id, DatasetRowModel.logical_id == logical_id)
            .order_by(DatasetRowModel.version.asc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def list_dataset_versions(self, dataset_id: str) -> list[DatasetVersionModel]:
        stmt = (
            select(DatasetVersionModel)
            .where(DatasetVersionModel.dataset_id == dataset_id)
            .order_by(DatasetVersionModel.version.desc())
        )
        res = await self.session.execute(stmt)
        return res.scalars().all()

    async def add_row(
        self,
        dataset_id: str,
        input_data: Any,
        expected_data: Any,
        meta: Optional[dict[str, Any]] = None,
        example_type: str = "gold",
        source_trace_id: Optional[str] = None,
        version_meta: Optional[dict[str, Any]] = None,
    ) -> DatasetRowModel:
        dataset = await self.get_dataset(dataset_id)
        await self._next_dataset_version(dataset)

        row = DatasetRowModel(
            id=f"dr_{uuid.uuid4().hex[:8]}",
            dataset_id=dataset_id,
            logical_id=f"drl_{uuid.uuid4().hex[:8]}",
            version=1,
            dataset_version=int(dataset.version),
            is_deleted=False,
            input=input_data or {},
            expected=expected_data or {},
            meta=meta or {},
            example_type=example_type,
            source_trace_id=source_trace_id,
            created_at=int(time.time() * 1000),
        )

        self.session.add(row)
        await self._record_dataset_version(
            dataset=dataset,
            action="insert",
            logical_id=row.logical_id,
            row_id=row.id,
            meta=version_meta or {},
        )

        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def update_row(
        self,
        dataset_id: str,
        row_id: str,
        input_data: Optional[Any] = None,
        expected_data: Optional[Any] = None,
        meta: Optional[dict[str, Any]] = None,
        example_type: Optional[str] = None,
        is_deleted: Optional[bool] = None,
        version_meta: Optional[dict[str, Any]] = None,
    ) -> DatasetRowModel:
        dataset = await self.get_dataset(dataset_id)
        row = await self.session.get(DatasetRowModel, row_id)
        if not row or row.dataset_id != dataset_id:
            raise ValueError("Dataset row not found")

        latest = await self._latest_row_for_logical_id(dataset_id, row.logical_id)
        if not latest:
            raise ValueError("Latest dataset row not found")

        await self._next_dataset_version(dataset)

        new_row = DatasetRowModel(
            id=f"dr_{uuid.uuid4().hex[:8]}",
            dataset_id=dataset_id,
            logical_id=latest.logical_id,
            version=int(latest.version) + 1,
            dataset_version=int(dataset.version),
            is_deleted=latest.is_deleted if is_deleted is None else bool(is_deleted),
            input=latest.input if input_data is None else input_data,
            expected=latest.expected if expected_data is None else expected_data,
            meta=latest.meta if meta is None else meta,
            example_type=latest.example_type if example_type is None else example_type,
            source_trace_id=latest.source_trace_id,
            created_at=int(time.time() * 1000),
        )

        self.session.add(new_row)
        await self._record_dataset_version(
            dataset=dataset,
            action="update",
            logical_id=new_row.logical_id,
            row_id=new_row.id,
            meta=version_meta or {},
        )

        await self.session.commit()
        await self.session.refresh(new_row)
        return new_row

    async def delete_row(
        self,
        dataset_id: str,
        row_id: str,
        version_meta: Optional[dict[str, Any]] = None,
    ) -> DatasetRowModel:
        dataset = await self.get_dataset(dataset_id)
        row = await self.session.get(DatasetRowModel, row_id)
        if not row or row.dataset_id != dataset_id:
            raise ValueError("Dataset row not found")

        latest = await self._latest_row_for_logical_id(dataset_id, row.logical_id)
        if not latest:
            raise ValueError("Latest dataset row not found")

        if latest.is_deleted:
            return latest

        await self._next_dataset_version(dataset)

        new_row = DatasetRowModel(
            id=f"dr_{uuid.uuid4().hex[:8]}",
            dataset_id=dataset_id,
            logical_id=latest.logical_id,
            version=int(latest.version) + 1,
            dataset_version=int(dataset.version),
            is_deleted=True,
            input=latest.input,
            expected=latest.expected,
            meta=latest.meta,
            example_type=latest.example_type,
            source_trace_id=latest.source_trace_id,
            created_at=int(time.time() * 1000),
        )

        self.session.add(new_row)
        await self._record_dataset_version(
            dataset=dataset,
            action="delete",
            logical_id=new_row.logical_id,
            row_id=new_row.id,
            meta=version_meta or {},
        )

        await self.session.commit()
        await self.session.refresh(new_row)
        return new_row

    async def flush(self, dataset_id: str, reason: Optional[str] = None) -> DatasetVersionModel:
        dataset = await self.get_dataset(dataset_id)
        current_rows = await self.list_rows(dataset_id)

        await self._next_dataset_version(dataset)
        entry = await self._record_dataset_version(
            dataset=dataset,
            action="flush",
            meta={
                "reason": reason,
                "rows_cleared": len(current_rows),
            },
        )

        await self.session.commit()
        await self.session.refresh(entry)
        return entry


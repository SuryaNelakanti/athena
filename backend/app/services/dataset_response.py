from ..models import DatasetModel
from ..schemas.datasets import DatasetCounts, DatasetResponse


def build_dataset_response(
    dataset: DatasetModel,
    row_counts: dict[str, int],
) -> DatasetResponse:
    return DatasetResponse(
        id=dataset.id,
        project_id=dataset.project_id,
        name=dataset.name,
        description=dataset.description,
        version=dataset.version,
        kind=dataset.kind,
        schema=dataset.schema or {},
        schema_version=dataset.schema_version,
        review_policy=dataset.review_policy or {},
        created_at=dataset.created_at,
        row_counts=DatasetCounts(**row_counts),
    )

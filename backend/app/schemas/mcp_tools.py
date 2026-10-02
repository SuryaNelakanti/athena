from typing import List, Optional

from pydantic import BaseModel


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

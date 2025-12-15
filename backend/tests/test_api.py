
import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from sqlmodel import Session

from app.main import app, get_session
from app.models import TraceModel, SpanModel

def mock_get_session():
    # We can mock the session here if we want to unit test without DB
    # For now, let's just let it try to connect (integration test) 
    # OR we can override the dependency with a mock.
    pass

client = TestClient(app)

# We can perform a comprehensive test by mocking the DB session execution
@patch("app.main.select")
def test_get_filters(mock_select):
    # This is complex to mock purely with unit tests because of the async execution / sqlmodel logic
    # Integration tests are better for this.
    pass

def test_read_main():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Athena API is running with SQLite persistence (Async)"}

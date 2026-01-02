# MCP Server (Local Dev)

Athena exposes MCP tools over HTTP at `http://localhost:8000/mcp`.
The local server auto-approves OAuth requests (no login UI).

## IDE Integration
For Cursor, VS Code, and Claude Code setup, see `docs/mcp-ide-setup.md`.
If your IDE only supports MCP over stdio, use `scripts/mcp_http_bridge.mjs`.

## OAuth2 PKCE Flow

1) Generate a code verifier and challenge (S256).
```python
import base64
import hashlib
import secrets

verifier = secrets.token_urlsafe(32)
challenge = base64.urlsafe_b64encode(
    hashlib.sha256(verifier.encode("utf-8")).digest()
).rstrip(b"=").decode("ascii")
print("verifier:", verifier)
print("challenge:", challenge)
```

2) Request an authorization code.
```
GET http://localhost:8000/mcp/oauth/authorize?response_type=code&client_id=local-dev&redirect_uri=http://localhost/callback&code_challenge=CHALLENGE&code_challenge_method=S256&state=abc123
```

The server redirects to the `redirect_uri` with `code` + `state` query params.

3) Exchange the code for a token (form-encoded).
```bash
curl -X POST http://localhost:8000/mcp/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=authorization_code" \
  --data-urlencode "code=AUTH_CODE" \
  --data-urlencode "redirect_uri=http://localhost/callback" \
  --data-urlencode "client_id=local-dev" \
  --data-urlencode "code_verifier=VERIFIER"
```

4) Call MCP tools with `Authorization: Bearer <access_token>`.

Tokens expire after 1 hour. Authorization codes expire after 10 minutes.

## Tool Endpoints

- `POST /mcp/tools/search_docs`
  - Body: `{ "query": "trace context", "limit": 8 }`
- `POST /mcp/tools/resolve_object`
  - Body: `{ "object_type": "dataset", "name_or_id": "Support QA", "project_id": "proj_default", "include_permalink": true }`
- `POST /mcp/tools/list_recent_objects`
  - Body: `{ "object_types": ["project", "dataset", "experiment"], "limit": 10 }`
- `POST /mcp/tools/infer_schema`
  - Body: `{ "dataset_id": "ds_123", "limit": 5 }` or `{ "aql_query": "from project_logs('proj_default') select model, total_tokens limit 5" }`
- `POST /mcp/tools/aql_query`
  - Body: `{ "query": "from project_logs('proj_default') select model, total_tokens limit 10" }`
- `POST /mcp/tools/summarize_experiment`
  - Body: `{ "experiment_id": "exp_123" }` (or `version_id` / `run_id`)
- `POST /mcp/tools/generate_permalink`
  - Body: `{ "object_type": "trace", "object_id": "trace_123", "project_id": "proj_default", "expires_in": 3600 }`

All tool requests require `Authorization: Bearer <access_token>`.

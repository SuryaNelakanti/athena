# MCP IDE Setup (Cursor, VS Code, Claude Code)

Athena exposes MCP tools over HTTP at `http://localhost:8000/mcp`.
Most IDEs expect MCP over stdio. Use the included bridge:
`scripts/mcp_http_bridge.mjs`.

## Prereqs
1) Start the Athena backend.
2) Complete the OAuth flow in `docs/mcp.md` to get an access token.
3) Set environment variables:
   - `ATHENA_MCP_BASE_URL` (default: `http://localhost:8000/mcp`)
   - `ATHENA_MCP_TOKEN` (required)

## Cursor
Cursor supports MCP servers that run as local commands.
Configure a server that launches the bridge script with environment variables.

Example config (adjust to your Cursor version/location):
```json
{
  "mcpServers": {
    "athena": {
      "command": "node",
      "args": ["scripts/mcp_http_bridge.mjs"],
      "env": {
        "ATHENA_MCP_BASE_URL": "http://localhost:8000/mcp",
        "ATHENA_MCP_TOKEN": "YOUR_ACCESS_TOKEN"
      }
    }
  }
}
```

## VS Code
Install an MCP-compatible extension or use VS Code's MCP settings (if available),
then register a command-based MCP server.

Example settings entry (names may vary by extension):
```json
{
  "mcp.servers": [
    {
      "name": "athena",
      "command": "node",
      "args": ["scripts/mcp_http_bridge.mjs"],
      "env": {
        "ATHENA_MCP_BASE_URL": "http://localhost:8000/mcp",
        "ATHENA_MCP_TOKEN": "YOUR_ACCESS_TOKEN"
      }
    }
  ]
}
```

## Claude Code
Claude Code can attach MCP servers via command-based configuration.
Point it at the bridge script and pass the same environment variables.

Example MCP server entry:
```json
{
  "name": "athena",
  "command": "node",
  "args": ["scripts/mcp_http_bridge.mjs"],
  "env": {
    "ATHENA_MCP_BASE_URL": "http://localhost:8000/mcp",
    "ATHENA_MCP_TOKEN": "YOUR_ACCESS_TOKEN"
  }
}
```

If your client supports HTTP MCP directly, you can skip the bridge and configure
the base URL/token in its UI.

## Smoke test
Use these quick checks after connecting an IDE client.
1) Call `search_docs` with a query like "AQL" and confirm results are returned.
2) Call `list_recent_objects` with your `project_id` and confirm objects list.
3) Call `infer_schema` with a dataset id or a small AQL query.
4) Call `aql_query` with a simple query (example below) and confirm rows.
5) Call `generate_permalink` for a known trace/log id to verify share link creation.

Example AQL:
`from project_logs(project_id="<PROJECT_ID>") select timestamp, total_tokens limit 5`

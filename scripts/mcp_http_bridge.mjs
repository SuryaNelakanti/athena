#!/usr/bin/env node
import { createInterface } from "node:readline";

const baseUrl = (process.env.ATHENA_MCP_BASE_URL || "http://localhost:8000/mcp").replace(/\/+$/, "");
const token = process.env.ATHENA_MCP_TOKEN;

if (!token) {
  console.error("ATHENA_MCP_TOKEN is required.");
  process.exit(1);
}

const serverInfo = {
  name: "athena-mcp-bridge",
  version: "0.1.0",
};

const toolDefinitions = [
  {
    name: "search_docs",
    description: "Search Athena docs for matching text.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "resolve_object",
    description: "Resolve object by name or id and optionally return a permalink.",
    inputSchema: {
      type: "object",
      properties: {
        object_type: { type: "string" },
        name_or_id: { type: "string" },
        project_id: { type: "string" },
        include_permalink: { type: "boolean" },
      },
      required: ["object_type", "name_or_id"],
    },
  },
  {
    name: "list_recent_objects",
    description: "List recent objects (projects, datasets, experiments, functions, views).",
    inputSchema: {
      type: "object",
      properties: {
        object_types: { type: "array", items: { type: "string" } },
        project_id: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "infer_schema",
    description: "Infer schema for a dataset or AQL query.",
    inputSchema: {
      type: "object",
      properties: {
        dataset_id: { type: "string" },
        aql_query: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "aql_query",
    description: "Execute an AQL query.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "summarize_experiment",
    description: "Summarize experiment runs by experiment, version, or run id.",
    inputSchema: {
      type: "object",
      properties: {
        experiment_id: { type: "string" },
        version_id: { type: "string" },
        run_id: { type: "string" },
      },
    },
  },
  {
    name: "generate_permalink",
    description: "Create a share link for an object.",
    inputSchema: {
      type: "object",
      properties: {
        object_type: { type: "string" },
        object_id: { type: "string" },
        project_id: { type: "string" },
        org_id: { type: "string" },
        expires_in: { type: "number" },
      },
      required: ["object_type", "object_id"],
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, message, code = -32603) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

async function postJson(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload ?? {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function callTool(name, args) {
  return postJson(`/tools/${name}`, args || {});
}

async function handleMessage(message) {
  const { id, method, params } = message;
  if (!method) {
    return;
  }

  if (method === "initialize") {
    respond(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo,
    });
    return;
  }

  if (method === "initialized") {
    return;
  }

  if (method === "tools/list") {
    respond(id, { tools: toolDefinitions });
    return;
  }

  if (method === "tools/call") {
    try {
      const toolName = params?.name;
      if (!toolName) {
        respondError(id, "Missing tool name", -32602);
        return;
      }
      const result = await callTool(toolName, params?.arguments || {});
      respond(id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      });
    } catch (err) {
      respond(id, {
        isError: true,
        content: [
          {
            type: "text",
            text: err instanceof Error ? err.message : "Tool call failed.",
          },
        ],
      });
    }
    return;
  }

  respondError(id, `Method not found: ${method}`, -32601);
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }
  try {
    const message = JSON.parse(trimmed);
    void handleMessage(message);
  } catch (err) {
    respondError(null, "Invalid JSON input", -32700);
  }
});

# Athena SDKs

This folder contains minimal Python and TypeScript SDKs for Athena's proxy API.

Contents
- `sdk/python`: Python SDK with trace context helpers and `@observe`.
- `sdk/typescript`: TypeScript SDK with trace context helpers.

Both SDKs enforce that a `trace_id` is always included in proxy calls. Each
call uses a `trace_group_id` (defaults to `trace_id`) and supports
`parent_span_id` for nesting spans.

Trace ID Format
- `trace_id` values are generated as `trace_{uuid}` unless you supply one.

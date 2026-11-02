# 0016. Read-only MCP server as the agent's door to the engine

- Status: accepted
- Date: 2026-11-02
- Deciders: Sodabeh Taherpanah

## Context and problem
An agent needs shortage data. Giving it the engine, files or a database would widen the attack surface and
tie it to internals.

## Options considered
1. **Agent imports the engine.** Tight coupling; blocks the dependency rules.
2. **Custom REST API.** More to build and secure for one consumer.
3. **MCP server (stdio) with two read-only tools.**

## Decision
Option 3 in `@vorchain/mcp` using the official SDK: `list_shortages` and `get_projection`, both annotated
read-only. The server has no write, file or network access; the caller passes the dataset in. Arguments are
validated by zod (limit 1-100, material id 1-64 chars). Only `mcp` may use `engine`, `parsers`, `sample-data`;
nothing else may import `mcp`. Material text in results is untrusted data.

## Consequences
- Positive: any MCP client (Claude Desktop, Inspector, our agent) can use it; the tool surface is two functions.
- Negative: the SDK is a new dependency; the stdio server runs on bundled sample data until a real source exists.

## References
- `packages/mcp/src/server.test.ts`, `packages/mcp/src/stdio.test.ts`

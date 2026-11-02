# @vorchain/mcp

Read-only [MCP](https://modelcontextprotocol.io) server that lets an AI agent ask the engine about shortages.

| Tool | Arguments | Returns |
|---|---|---|
| `list_shortages` | `severity?`, `hiddenOnly?`, `limit?` (1-100, default 20) | `asOf`, `horizonDays`, `summary`, `total`, ranked `exceptions` with reasons and actions |
| `get_projection` | `materialId` | day-by-day ERP and realistic stock for one material; unknown id gives a tool error |

- Both tools are annotated read-only. The server has no write, file or network access: the dataset is passed to
  `createVorchainServer({ input, options })` by the caller.
- `pnpm --filter @vorchain/mcp serve [de|en]` starts a stdio server on the bundled sample data (for Claude Desktop,
  MCP Inspector, V-09's agent).
- Material descriptions come from the customer's file. They are returned as data and must be treated as untrusted
  text by the agent (see the guardrails in `@vorchain/llm`).
- Boundaries (ESLint): may use `engine`, `parsers`, `sample-data`; never `llm`, `ui`, `web`; nothing else may import it.

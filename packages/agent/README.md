# @vorchain/agent

Review agent with a real human-approval interrupt. It reads the top shortages, drafts one supplier e-mail each
(`@vorchain/llm`), saves the state and **stops**. Nothing is sent until a person decides.

| Step | Function | Can send? |
|---|---|---|
| 1. Prepare | `startRun({ tools, provider, store }, { runId, language })` | No: it gets no sender, so it cannot |
| 2. Interrupt | state saved as plain JSON in a `StateStore` (any process can continue later) | - |
| 3. Decide | `resumeRun({ store, sender }, runId, decisions)` with `approve` (optionally edited) or `reject` per proposal | Only approved proposals, once each |

- Edits are checked with the same schema and output guard as a model draft; a bad batch sends nothing.
- A failed send is recorded (`failed` + code) and is not retried automatically.
- Tools come from `createMcpTools(client)` (the V-08 server) or any `ShortageTools`. Material text is customer data and is cleaned before it reaches the model.
- Boundaries (ESLint): may use `llm`; never `engine`, `parsers`, `mcp`, `ui`, `web`; nothing may import it.

/**
 * Stdio entry: `pnpm --filter @vorchain/mcp serve [de|en]` serves the bundled sample data.
 * Kept outside `src` because it only wires the tested pieces to the process; `src/stdio.test.ts`
 * starts it for real.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadSampleData } from './src/sample.ts';
import { createVorchainServer } from './src/server.ts';

const locale = process.argv[2] === 'en' ? 'en' : 'de';
await createVorchainServer(await loadSampleData(locale)).connect(new StdioServerTransport());

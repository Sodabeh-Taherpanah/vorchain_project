/**
 * The demo's Web Worker (ADR-0003): parsing and analysis run here, off the main thread, and
 * uploaded files never leave it. Thin Comlink wrapper around {@link createAnalysisService}.
 */
import { expose } from 'comlink';

import { createAnalysisService } from './analysis-service.ts';

expose(createAnalysisService());

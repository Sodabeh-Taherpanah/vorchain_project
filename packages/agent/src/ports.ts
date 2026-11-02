import type { LlmProvider } from '@vorchain/llm';

import type { RunState } from './state.ts';

export interface ShortageSummary {
  readonly materialId: string;
  readonly description: string;
  readonly mainSupplierId: string | null;
  readonly severity: 'CRITICAL' | 'WARNING';
  readonly criticalDate: string;
  readonly erpViewDate: string | null;
  readonly daysUntil: number;
  readonly minProjectedStock: number;
  readonly safetyStock: number;
  readonly hidden: boolean;
  readonly reasons: readonly { readonly code: string }[];
  readonly actions: readonly { readonly code: string }[];
}

export interface ShortageListing {
  readonly asOf: string;
  readonly exceptions: readonly ShortageSummary[];
}

/** Read-only view of the analysis. The MCP adapter is one implementation. */
export interface ShortageTools {
  listShortages(args: {
    readonly limit: number;
    readonly hiddenOnly?: boolean;
  }): Promise<ShortageListing>;
}

/** Where the run waits during the interrupt. Holds only the validated `RunState` JSON. */
export interface StateStore {
  save(runId: string, state: RunState): Promise<void>;
  /** `null` when unknown. The value is re-validated, so a store may return anything. */
  load(runId: string): Promise<unknown>;
}

export interface OutgoingEmail {
  readonly proposalId: string;
  readonly materialId: string;
  readonly supplierId: string;
  readonly subject: string;
  readonly body: string;
}

/** The only way anything leaves the agent. It is called from `resumeRun` after approval, nowhere else. */
export type Sender = (email: OutgoingEmail) => Promise<{ ok: true } | { ok: false; code: string }>;

export interface PrepareDeps {
  readonly tools: ShortageTools;
  readonly provider: LlmProvider;
  readonly store: StateStore;
}

export interface ResumeDeps {
  readonly store: StateStore;
  readonly sender: Sender;
}

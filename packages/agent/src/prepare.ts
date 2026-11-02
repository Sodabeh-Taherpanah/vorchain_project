import { draftSupplierEmail, type ExplanationFacts, type Language } from '@vorchain/llm';

import type { PrepareDeps, ShortageSummary } from './ports.ts';
import { STATE_VERSION, type Proposal, type RunState } from './state.ts';

export const DEFAULT_LIMIT = 3;
const NAME_MAX = 80;
// Control characters (\p{Cc}) and line/paragraph separators (\p{Zl}, \p{Zp}): the description is
// customer text and must stay one clean line.
const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}]+/gu;

export interface PrepareOptions {
  /** Chosen by the caller so a run is reproducible and findable; the agent never invents ids. */
  readonly runId: string;
  readonly language: Language;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

function toFacts(item: ShortageSummary, asOf: string): unknown {
  const name = item.description.replace(CONTROL, ' ').trim().slice(0, NAME_MAX).trim();
  const facts: ExplanationFacts = {
    materialId: item.materialId,
    materialName: name === '' ? item.materialId : name,
    severity: item.severity,
    asOf,
    criticalDate: item.criticalDate,
    erpViewDate: item.erpViewDate,
    daysUntil: item.daysUntil,
    minProjectedStock: item.minProjectedStock,
    safetyStock: item.safetyStock,
    hidden: item.hidden,
    // The schema checks the codes; an unknown one skips the material instead of being cast away.
    reasonCodes: item.reasons.map((r) => r.code) as ExplanationFacts['reasonCodes'],
    actionCodes: item.actions.map((a) => a.code) as ExplanationFacts['actionCodes'],
    supplier: null,
  };
  return facts;
}

/**
 * Phase 1 of the agent: read the top shortages, draft one e-mail each, save the state and stop.
 * It receives no sender, so by construction it cannot send anything: the interrupt is the end of
 * this function, and only `resumeRun` with a human decision can continue.
 */
export async function startRun(deps: PrepareDeps, options: PrepareOptions): Promise<RunState> {
  const listing = await deps.tools.listShortages({ limit: options.limit ?? DEFAULT_LIMIT });
  const proposals: Proposal[] = [];
  const skipped: RunState['skipped'] = [];

  for (const item of listing.exceptions) {
    if (item.mainSupplierId === null) {
      skipped.push({ materialId: item.materialId, reason: 'NO_SUPPLIER' });
      continue;
    }
    const draft = await draftSupplierEmail(deps.provider, toFacts(item, listing.asOf), {
      language: options.language,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!draft.ok) {
      skipped.push({ materialId: item.materialId, reason: draft.error.code });
      continue;
    }
    proposals.push({
      id: `${options.runId}:${item.materialId}`,
      materialId: item.materialId,
      supplierId: item.mainSupplierId,
      severity: item.severity,
      hidden: item.hidden,
      criticalDate: item.criticalDate,
      draft: draft.value,
      status: 'pending',
    });
  }

  const state: RunState = {
    version: STATE_VERSION,
    runId: options.runId,
    asOf: listing.asOf,
    status: proposals.length > 0 ? 'awaiting_approval' : 'completed',
    proposals,
    skipped,
  };
  await deps.store.save(state.runId, state);
  return state;
}

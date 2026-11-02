import { isUnsafeOutput, supplierEmailSchema } from '@vorchain/llm';

import type { ResumeDeps } from './ports.ts';
import { runStateSchema, type Proposal, type RunState } from './state.ts';

export type Decision =
  | {
      readonly proposalId: string;
      readonly action: 'approve';
      /** The planner's edited text. It goes through the same schema and output guard as a draft. */
      readonly edited?: { readonly subject: string; readonly body: string };
    }
  | { readonly proposalId: string; readonly action: 'reject' };

export type ResumeError =
  | 'NOT_FOUND'
  | 'STATE_INVALID'
  | 'UNKNOWN_PROPOSAL'
  | 'DUPLICATE_DECISION'
  | 'ALREADY_DECIDED'
  | 'INVALID_EDIT';

export type ResumeResult =
  | { readonly ok: true; readonly state: RunState }
  | { readonly ok: false; readonly error: ResumeError };

const fail = (error: ResumeError): ResumeResult => ({ ok: false, error });

/** Checks every decision before any side effect, so a bad batch sends nothing. */
function validate(
  state: RunState,
  decisions: readonly Decision[],
): ResumeError | readonly (readonly [Decision, Proposal])[] {
  const seen = new Set<string>();
  const pairs: (readonly [Decision, Proposal])[] = [];
  for (const decision of decisions) {
    const proposal = state.proposals.find((p) => p.id === decision.proposalId);
    if (proposal === undefined) return 'UNKNOWN_PROPOSAL';
    if (seen.has(proposal.id)) return 'DUPLICATE_DECISION';
    seen.add(proposal.id);
    if (proposal.status !== 'pending') return 'ALREADY_DECIDED';
    if (decision.action === 'approve' && decision.edited !== undefined) {
      const edit = supplierEmailSchema.safeParse(decision.edited);
      if (!edit.success || isUnsafeOutput(edit.data)) return 'INVALID_EDIT';
    }
    pairs.push([decision, proposal]);
  }
  return pairs;
}

/**
 * Phase 2: continue a saved run with the human's decisions. Only an `approve` reaches the sender,
 * once per proposal; anything not decided stays pending and the run stays interrupted. State is
 * saved after every step, so a crash mid-way never forgets a send that happened. A failed send is
 * recorded and not retried: the planner decides again.
 */
export async function resumeRun(
  deps: ResumeDeps,
  runId: string,
  decisions: readonly Decision[],
): Promise<ResumeResult> {
  const stored = await deps.store.load(runId);
  if (stored === null || stored === undefined) return fail('NOT_FOUND');
  const parsed = runStateSchema.safeParse(stored);
  if (!parsed.success) return fail('STATE_INVALID');

  let state = parsed.data;
  const checked = validate(state, decisions);
  if (typeof checked === 'string') return fail(checked);

  for (const [decision, current] of checked) {
    const next: Proposal =
      decision.action === 'reject'
        ? { ...current, status: 'rejected' }
        : await approve(deps, { ...current, draft: decision.edited ?? current.draft });
    state = replace(state, next);
    await deps.store.save(runId, state);
  }
  return { ok: true, state };
}

async function approve(deps: ResumeDeps, proposal: Proposal): Promise<Proposal> {
  const result = await deps.sender({
    proposalId: proposal.id,
    materialId: proposal.materialId,
    supplierId: proposal.supplierId,
    subject: proposal.draft.subject,
    body: proposal.draft.body,
  });
  return result.ok
    ? { ...proposal, status: 'sent' }
    : { ...proposal, status: 'failed', failure: result.code.slice(0, 80) };
}

function replace(state: RunState, next: Proposal): RunState {
  const proposals = state.proposals.map((p) => (p.id === next.id ? next : p));
  const open = proposals.some((p) => p.status === 'pending');
  return { ...state, proposals, status: open ? 'awaiting_approval' : 'completed' };
}

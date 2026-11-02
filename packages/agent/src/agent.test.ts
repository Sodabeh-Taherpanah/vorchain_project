import { createFakeProvider } from '@vorchain/llm';
import { describe, expect, it, vi } from 'vitest';

import type { ShortageSummary, ShortageTools, StateStore } from './ports.ts';
import { startRun } from './prepare.ts';
import { resumeRun, type Decision } from './resume.ts';
import type { RunState } from './state.ts';

const EMAIL = JSON.stringify({
  subject: 'Lieferverzug M-1',
  body: 'Guten Tag, bitte bestätigen Sie uns den Liefertermin. Viele Grüße [Name]',
});

const item = (id: string, over: Partial<ShortageSummary> = {}): ShortageSummary => ({
  materialId: id,
  description: `Teil ${id}`,
  mainSupplierId: 'S-1',
  severity: 'CRITICAL',
  criticalDate: '2026-10-12',
  erpViewDate: null,
  daysUntil: 7,
  minProjectedStock: -40,
  safetyStock: 10,
  hidden: true,
  reasons: [{ code: 'HIDDEN_ERP_NONE' }],
  actions: [{ code: 'EXPEDITE' }],
  ...over,
});

const toolsOf = (...exceptions: ShortageSummary[]): ShortageTools => ({
  listShortages: () => Promise.resolve({ asOf: '2026-10-05', exceptions }),
});

/** Stores JSON strings, so a test proves the state survives serialisation (a real interrupt). */
function jsonStore(): StateStore & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    save: (id, state) => {
      raw.set(id, JSON.stringify(state));
      return Promise.resolve();
    },
    load: (id) => {
      const text = raw.get(id);
      return Promise.resolve(text === undefined ? null : (JSON.parse(text) as unknown));
    },
  };
}

const okSender = () => vi.fn().mockResolvedValue({ ok: true });

async function prepared(...exceptions: ShortageSummary[]) {
  const store = jsonStore();
  const provider = createFakeProvider({ replies: [EMAIL] });
  const state = await startRun(
    { tools: toolsOf(...exceptions), provider, store },
    {
      runId: 'r1',
      language: 'de',
    },
  );
  return { store, provider, state };
}

const approve = (proposalId: string, edited?: { subject: string; body: string }): Decision =>
  edited === undefined
    ? { proposalId, action: 'approve' }
    : { proposalId, action: 'approve', edited };

describe('startRun: stops at the interrupt', () => {
  it('drafts one e-mail per shortage, saves the state and sends nothing', async () => {
    const { store, state } = await prepared(item('M-1'), item('M-2'));
    expect(state.status).toBe('awaiting_approval');
    expect(state.proposals.map((p) => [p.id, p.status])).toEqual([
      ['r1:M-1', 'pending'],
      ['r1:M-2', 'pending'],
    ]);
    // The saved JSON is the whole state: a new process can continue from it.
    expect(JSON.parse(store.raw.get('r1')!)).toEqual(state);
  });

  it('skips materials without a supplier and failed drafts, and says why', async () => {
    const store = jsonStore();
    const provider = createFakeProvider({ replies: ['not json', 'not json', EMAIL] });
    const state = await startRun(
      {
        tools: toolsOf(item('M-1'), item('M-2', { mainSupplierId: null }), item('M-3')),
        provider,
        store,
      },
      { runId: 'r1', language: 'en' },
    );
    expect(state.skipped).toEqual([
      { materialId: 'M-1', reason: 'INVALID_RESPONSE' },
      { materialId: 'M-2', reason: 'NO_SUPPLIER' },
    ]);
    expect(state.proposals.map((p) => p.materialId)).toEqual(['M-3']);
  });

  it('cleans a description with control characters and falls back to the id when it is empty', async () => {
    const { provider } = await prepared(
      item('M-1', { description: 'Schraube\nM8  ' }),
      item('M-2', { description: '\n\n' }),
    );
    const sent = provider.calls.map((c) => c.messages.map((m) => m.content).join('\n'));
    expect(sent[0]).toContain('Schraube M8');
    expect(sent[1]).toContain('"materialName":"M-2"');
  });

  it('completes at once when there is nothing to approve', async () => {
    const { state } = await prepared(item('M-1', { mainSupplierId: null }));
    expect(state).toMatchObject({ status: 'completed', proposals: [] });
  });

  it('skips a material whose reason code the facts schema does not know', async () => {
    const { state } = await prepared(item('M-1', { reasons: [{ code: 'SURPRISE' }] }));
    expect(state.skipped).toEqual([{ materialId: 'M-1', reason: 'INVALID_FACTS' }]);
  });
});

describe('resumeRun: only a human decision sends', () => {
  it('sends an approved draft once and records it; rejected drafts never reach the sender', async () => {
    const { store } = await prepared(item('M-1'), item('M-2'));
    const sender = okSender();
    const result = await resumeRun({ store, sender }, 'r1', [
      approve('r1:M-1'),
      { proposalId: 'r1:M-2', action: 'reject' },
    ]);
    expect(result).toMatchObject({ ok: true, state: { status: 'completed' } });
    expect(sender).toHaveBeenCalledTimes(1);
    expect(sender.mock.calls[0]?.[0]).toMatchObject({ proposalId: 'r1:M-1', supplierId: 'S-1' });
    const saved = JSON.parse(store.raw.get('r1')!) as RunState;
    expect(saved.proposals.map((p) => p.status)).toEqual(['sent', 'rejected']);
  });

  it('stays interrupted while a proposal is undecided, and cannot be approved twice', async () => {
    const { store } = await prepared(item('M-1'), item('M-2'));
    const sender = okSender();
    const first = await resumeRun({ store, sender }, 'r1', [approve('r1:M-1')]);
    expect(first).toMatchObject({ ok: true, state: { status: 'awaiting_approval' } });
    const again = await resumeRun({ store, sender }, 'r1', [approve('r1:M-1')]);
    expect(again).toEqual({ ok: false, error: 'ALREADY_DECIDED' });
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it('sends the planner’s edited text, not the draft', async () => {
    const { store } = await prepared(item('M-1'));
    const sender = okSender();
    const edited = { subject: 'Dringend: M-1', body: 'Bitte liefern Sie bis Freitag.' };
    await resumeRun({ store, sender }, 'r1', [approve('r1:M-1', edited)]);
    expect(sender.mock.calls[0]?.[0]).toMatchObject(edited);
  });

  it('refuses an unsafe or malformed edit before sending anything', async () => {
    const { store } = await prepared(item('M-1'), item('M-2'));
    const sender = okSender();
    for (const edited of [
      { subject: 'Hallo', body: 'Klick [hier](https://evil.example)' },
      { subject: 'Hallo', body: '' },
    ]) {
      const result = await resumeRun({ store, sender }, 'r1', [
        approve('r1:M-1'),
        approve('r1:M-2', edited),
      ]);
      expect(result).toEqual({ ok: false, error: 'INVALID_EDIT' });
    }
    expect(sender).not.toHaveBeenCalled();
  });

  it('rejects unknown and duplicate decisions without side effects', async () => {
    const { store } = await prepared(item('M-1'));
    const sender = okSender();
    expect(await resumeRun({ store, sender }, 'r1', [approve('nope')])).toEqual({
      ok: false,
      error: 'UNKNOWN_PROPOSAL',
    });
    expect(
      await resumeRun({ store, sender }, 'r1', [approve('r1:M-1'), approve('r1:M-1')]),
    ).toEqual({
      ok: false,
      error: 'DUPLICATE_DECISION',
    });
    expect(sender).not.toHaveBeenCalled();
  });

  it('records a failed send with its code and does not retry on its own', async () => {
    const { store } = await prepared(item('M-1'));
    const sender = vi.fn().mockResolvedValue({ ok: false, code: 'SMTP_DOWN' });
    const result = await resumeRun({ store, sender }, 'r1', [approve('r1:M-1')]);
    expect(result).toMatchObject({
      ok: true,
      state: { proposals: [{ status: 'failed', failure: 'SMTP_DOWN' }] },
    });
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it('reports a missing run and refuses a tampered state', async () => {
    const { store } = await prepared(item('M-1'));
    const sender = okSender();
    expect(await resumeRun({ store, sender }, 'other', [])).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    const tampered = JSON.parse(store.raw.get('r1')!) as Record<string, unknown>;
    store.raw.set('r1', JSON.stringify({ ...tampered, extra: 'x' }));
    expect(await resumeRun({ store, sender }, 'r1', [approve('r1:M-1')])).toEqual({
      ok: false,
      error: 'STATE_INVALID',
    });
    expect(sender).not.toHaveBeenCalled();
  });
});

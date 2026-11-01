import { describe, expect, it } from 'vitest';

import { createFakeProvider } from '../fake-provider.ts';
import { numbersAreGrounded } from './checks.ts';
import { EVAL_CASES, type EvalCase } from './cases.ts';
import { runEvaluation } from './run.ts';

const fakeFor = (c: EvalCase) => createFakeProvider({ replies: [c.reply] });

describe('evaluation set', () => {
  it('has about 20 cases with unique ids, mixing both languages and both tasks', () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(EVAL_CASES.length);
    expect(new Set(EVAL_CASES.map((c) => c.language))).toEqual(new Set(['de', 'en']));
    expect(new Set(EVAL_CASES.map((c) => c.kind))).toEqual(new Set(['explain', 'email']));
  });

  it('behaves as expected on every case with the fake provider (the CI gate)', async () => {
    const report = await runEvaluation(EVAL_CASES, fakeFor);
    const unexpected = report.outcomes.filter((o) => !o.asExpected);
    expect(unexpected).toEqual([]);
    expect(report.passed).toBe(report.total);
  });

  it('catches each kind of bad answer with exactly the check meant for it', async () => {
    const bad = EVAL_CASES.filter((c) => c.expectFail !== undefined);
    expect(bad.length).toBeGreaterThanOrEqual(6);
    const report = await runEvaluation(bad, fakeFor);
    for (const [i, outcome] of report.outcomes.entries()) {
      expect(outcome.failedChecks, outcome.id).toEqual([bad[i]?.expectFail]);
    }
  });

  it('is deterministic: two runs give the same report', async () => {
    const first = await runEvaluation(EVAL_CASES, fakeFor);
    const second = await runEvaluation(EVAL_CASES, fakeFor);
    expect(second).toEqual(first);
  });

  it('flags a regression: a good case whose answer turns bad no longer matches', async () => {
    const [first] = EVAL_CASES;
    if (first === undefined) throw new Error('no cases');
    const regressed: EvalCase = { ...first, reply: '{"summary":"x"}' };
    const report = await runEvaluation([regressed], fakeFor);
    expect(report.outcomes[0]).toMatchObject({ asExpected: false, failedChecks: ['result'] });
    expect(report.passed).toBe(0);
  });

  it('reports that an attack text reaching the prompt would fail the case', async () => {
    const attacked = EVAL_CASES.find((c) => c.attack !== undefined);
    if (attacked === undefined) throw new Error('no attack case');
    // An attack that the sanitiser does not recognise stays in the prompt, and the check notices.
    const leaky: EvalCase = {
      ...attacked,
      facts: { ...attacked.facts, materialName: 'harmless name' },
      attack: 'harmless name',
    };
    const report = await runEvaluation([leaky], fakeFor);
    expect(report.outcomes[0]?.failedChecks).toContain('attack-not-sent');
  });
});

describe('numbersAreGrounded', () => {
  const facts = EVAL_CASES[0]!.facts;
  it.each([
    ['Stock -120 on 14.10.2026, 6 days late, 55% on time', true],
    ['9 days left, safety stock 50, 18 deliveries', true],
    ['short by 4000 units', false],
    ['no numbers at all', true],
  ])('%s -> %s', (text, expected) => {
    expect(numbersAreGrounded(text, facts)).toBe(expected);
  });
});

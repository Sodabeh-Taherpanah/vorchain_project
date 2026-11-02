import { explainShortageWithLlm } from '../explain/explain-shortage.ts';
import { draftSupplierEmail } from '../explain/supplier-email.ts';
import type { LlmProvider, LlmRequest } from '../types.ts';
import {
  asksForDeliveryDate,
  confidenceMatchesEvidence,
  isInLanguage,
  keepsSenderPlaceholder,
  mentionsErpWhenHidden,
  mentionsMaterial,
  numbersAreGrounded,
} from './checks.ts';
import type { CheckName, EvalCase } from './cases.ts';

export interface CaseOutcome {
  readonly id: string;
  readonly failedChecks: readonly CheckName[];
  /** True when the failures are exactly those the case expects (none for a good answer). */
  readonly asExpected: boolean;
}

export interface EvalReport {
  readonly outcomes: readonly CaseOutcome[];
  readonly passed: number;
  readonly total: number;
}

const OPTIONS = { maxAttempts: 1 } as const;

async function runCase(provider: LlmProvider, c: EvalCase): Promise<readonly CheckName[]> {
  const failed: CheckName[] = [];
  const fail = (name: CheckName, ok: boolean): void => {
    if (!ok) failed.push(name);
  };
  const sent: LlmRequest[] = [];
  const spy: LlmProvider = {
    name: provider.name,
    complete: (request) => {
      sent.push(request);
      return provider.complete(request);
    },
  };

  if (c.kind === 'explain') {
    const result = await explainShortageWithLlm(spy, c.facts, { ...OPTIONS, language: c.language });
    fail('result', result.ok);
    if (result.ok) {
      const v = result.value;
      const text = [v.summary, ...v.riskDrivers, ...v.recommendedActions].join(' ');
      fail('grounded-numbers', numbersAreGrounded(text, c.facts));
      fail('mentions-material', mentionsMaterial(text, c.facts));
      fail('language', isInLanguage(text, c.language));
      fail('confidence', confidenceMatchesEvidence(v.confidence, c.facts));
      fail('erp-hint', mentionsErpWhenHidden(text, c.facts));
    }
  } else {
    const result = await draftSupplierEmail(spy, c.facts, { ...OPTIONS, language: c.language });
    fail('result', result.ok);
    if (result.ok) {
      const text = `${result.value.subject} ${result.value.body}`;
      fail('grounded-numbers', numbersAreGrounded(text, c.facts));
      fail('mentions-material', mentionsMaterial(text, c.facts));
      fail('language', isInLanguage(text, c.language));
      fail('placeholder', keepsSenderPlaceholder(result.value.body));
      fail('asks-for-date', asksForDeliveryDate(text, c.language));
    }
  }
  if (c.attack !== undefined) {
    const prompts = JSON.stringify(sent.map((r) => r.messages));
    fail('attack-not-sent', !prompts.includes(c.attack));
  }
  return failed;
}

/**
 * Runs every case against the provider `makeProvider` returns for it. In CI that is a fake
 * scripted with `case.reply`; for a manual quality run pass a real provider instead (then
 * deliberately bad cases do not apply, so filter them out with `expectFail === undefined`).
 */
export async function runEvaluation(
  cases: readonly EvalCase[],
  makeProvider: (c: EvalCase) => LlmProvider,
): Promise<EvalReport> {
  const outcomes: CaseOutcome[] = [];
  for (const c of cases) {
    const failedChecks = await runCase(makeProvider(c), c);
    const asExpected =
      c.expectFail === undefined
        ? failedChecks.length === 0
        : failedChecks.length === 1 && failedChecks[0] === c.expectFail;
    outcomes.push({ id: c.id, failedChecks, asExpected });
  }
  return { outcomes, passed: outcomes.filter((o) => o.asExpected).length, total: outcomes.length };
}

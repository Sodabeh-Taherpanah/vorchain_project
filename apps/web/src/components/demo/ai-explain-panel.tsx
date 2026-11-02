'use client';

import { Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@vorchain/ui/components/button';

import type { FactsForModel } from '../../ai/explanation-facts.ts';
import {
  explainWithAi,
  hostOf,
  type AiExplanation,
  type AiFailure,
  type AiProviderConfig,
} from '../../ai/gateway.ts';

const fieldClass =
  'mt-1 block h-10 w-full rounded-md border border-input bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-critical';

type Stage = 'off' | 'consent' | 'on';
type Mode = 'local' | 'remote';

/**
 * Everything the visitor entered for AI. Lives in memory only (ADR-0018): a reload, or a new
 * file, starts with AI off again, and the API key is never stored, logged or put in a URL.
 */
export interface AiSession {
  readonly stage: Stage;
  readonly mode: Mode;
  readonly localUrl: string;
  readonly localModel: string;
  readonly remoteUrl: string;
  readonly remoteModel: string;
  readonly apiKey: string;
  readonly remoteAgreed: boolean;
}

export const AI_OFF: AiSession = {
  stage: 'off',
  mode: 'local',
  localUrl: 'http://localhost:11434',
  localModel: 'llama3.1',
  remoteUrl: '',
  remoteModel: '',
  apiKey: '',
  remoteAgreed: false,
};

/** The provider settings if they are complete; a remote one also needs its separate consent. */
export function providerConfig(session: AiSession): AiProviderConfig | null {
  if (session.mode === 'local') {
    return hostOf(session.localUrl, 'local') === null || session.localModel.trim() === ''
      ? null
      : { kind: 'local', baseUrl: session.localUrl.trim(), model: session.localModel.trim() };
  }
  if (!session.remoteAgreed) return null;
  if (hostOf(session.remoteUrl) === null || session.remoteModel.trim() === '') return null;
  return {
    kind: 'remote',
    baseUrl: session.remoteUrl.trim(),
    model: session.remoteModel.trim(),
    apiKey: session.apiKey,
  };
}

export interface AiExplainPanelProps {
  readonly session: AiSession;
  readonly onSessionChange: (next: AiSession) => void;
  /** Facts of the material the drawer shows; `null` while the report is not available. */
  readonly facts: FactsForModel | null;
}

type Result =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly value: AiExplanation }
  | { readonly status: 'failed'; readonly code: AiFailure };

/**
 * Optional AI reading aid in the detail drawer (V-19, ADR-0015, ADR-0018). Off by default. Turning
 * it on needs an explicit consent that says what is sent and to whom; a remote provider needs a
 * second consent that names its host. Nothing is sent until "Explain" is pressed for one material.
 */
export function AiExplainPanel({ session, onSessionChange, facts }: AiExplainPanelProps) {
  const t = useTranslations('demo.report.drawer.ai');
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-testid="ai-panel"
      className="space-y-3 rounded-xl border bg-card p-4"
    >
      <h3 id={headingId} className="flex items-center gap-2 text-base font-semibold">
        <Sparkles aria-hidden className="size-4" />
        {t('heading')}
      </h3>
      {session.stage === 'off' && (
        <>
          <p className="text-sm text-muted-foreground">{t('intro')}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onSessionChange({ ...session, stage: 'consent' });
            }}
          >
            {t('enable')}
          </Button>
        </>
      )}
      {session.stage === 'consent' && (
        <ConsentForm session={session} onSessionChange={onSessionChange} />
      )}
      {session.stage === 'on' && (
        <Explainer
          key={facts?.materialId ?? ''}
          session={session}
          onSessionChange={onSessionChange}
          facts={facts}
        />
      )}
    </section>
  );
}

function ConsentForm({
  session,
  onSessionChange,
}: Pick<AiExplainPanelProps, 'session' | 'onSessionChange'>) {
  const t = useTranslations('demo.report.drawer.ai');
  const id = useId();
  const set = (patch: Partial<AiSession>) => {
    onSessionChange({ ...session, ...patch });
  };
  const remote = session.mode === 'remote';
  const host = remote ? hostOf(session.remoteUrl) : null;
  const ready = providerConfig(session) !== null;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) set({ stage: 'on' });
      }}
    >
      <p className="text-sm font-medium">{t('consent.sendsTitle')}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        <li>{t('consent.sendsNumbers')}</li>
        <li>{t('consent.sendsCodes')}</li>
        <li>{t('consent.sendsNames')}</li>
      </ul>
      <p className="text-sm">{t('consent.notSent')}</p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('consent.providerLegend')}</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name={`${id}-mode`}
            checked={!remote}
            onChange={() => {
              set({ mode: 'local' });
            }}
            className="mt-1"
          />
          <span>{t('consent.local')}</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name={`${id}-mode`}
            checked={remote}
            onChange={() => {
              set({ mode: 'remote' });
            }}
            className="mt-1"
          />
          <span>{t('consent.remote')}</span>
        </label>
      </fieldset>
      {!remote && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{t('consent.localHint')}</p>
          <Field
            id={`${id}-lurl`}
            label={t('consent.baseUrl')}
            value={session.localUrl}
            invalid={hostOf(session.localUrl, 'local') === null}
            onChange={(localUrl) => {
              set({ localUrl });
            }}
          />
          <Field
            id={`${id}-lmodel`}
            label={t('consent.model')}
            value={session.localModel}
            invalid={session.localModel.trim() === ''}
            onChange={(localModel) => {
              set({ localModel });
            }}
          />
        </div>
      )}
      {remote && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-critical">{t('consent.remoteWarning')}</p>
          <Field
            id={`${id}-rurl`}
            label={t('consent.baseUrlRemote')}
            value={session.remoteUrl}
            invalid={host === null}
            onChange={(remoteUrl) => {
              set({ remoteUrl, remoteAgreed: false });
            }}
          />
          <Field
            id={`${id}-rmodel`}
            label={t('consent.model')}
            value={session.remoteModel}
            invalid={session.remoteModel.trim() === ''}
            onChange={(remoteModel) => {
              set({ remoteModel });
            }}
          />
          <Field
            id={`${id}-key`}
            label={t('consent.apiKey')}
            type="password"
            value={session.apiKey}
            invalid={false}
            onChange={(apiKey) => {
              set({ apiKey });
            }}
          />
          <p className="text-xs text-muted-foreground">{t('consent.keyHint')}</p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={session.remoteAgreed}
              disabled={host === null}
              onChange={(event) => {
                set({ remoteAgreed: event.target.checked });
              }}
              className="mt-1"
            />
            <span>
              {host === null ? t('consent.remoteNeedsHost') : t('consent.remoteAgree', { host })}
            </span>
          </label>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!ready}>
          {t('consent.activate')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onSessionChange({ ...AI_OFF });
          }}
        >
          {t('consent.cancel')}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  invalid,
  type = 'text',
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly invalid: boolean;
  readonly type?: 'text' | 'password';
  readonly onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid}
        className={fieldClass}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  );
}

function Explainer({ session, onSessionChange, facts }: AiExplainPanelProps) {
  const t = useTranslations('demo.report.drawer.ai');
  const locale = useLocale();
  const [result, setResult] = useState<Result>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  // The panel is keyed by material, so a different one starts clean; leaving cancels a request.
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const config = providerConfig(session);
  const run = () => {
    if (facts === null || config === null) return;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setResult({ status: 'running' });
    void explainWithAi(facts, config, locale === 'de' ? 'de' : 'en', next.signal).then((out) => {
      if (next.signal.aborted) return;
      setResult(
        out.ok ? { status: 'done', value: out.value } : { status: 'failed', code: out.code },
      );
    });
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {session.mode === 'local'
          ? t('active.local')
          : t('active.remote', { host: hostOf(session.remoteUrl) ?? '' })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={run}
          disabled={facts === null || config === null || result.status === 'running'}
        >
          {result.status === 'running' ? t('explaining') : t('explain')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            controller.current?.abort();
            onSessionChange({ ...AI_OFF });
          }}
        >
          {t('disable')}
        </Button>
      </div>
      {result.status === 'failed' && (
        <p role="alert" className="text-sm font-medium text-critical">
          {t(`errors.${result.code}`)}
        </p>
      )}
      {result.status === 'done' && <ExplanationView value={result.value} />}
    </div>
  );
}

/** Plain text only: model output is never rendered as HTML or markdown. */
function ExplanationView({ value }: { readonly value: AiExplanation }) {
  const t = useTranslations('demo.report.drawer.ai');
  return (
    <div data-testid="ai-result" className="space-y-2 text-sm">
      <p>{value.summary}</p>
      <p className="font-medium">{t('result.drivers')}</p>
      <ul className="list-disc space-y-1 pl-5">
        {value.riskDrivers.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="font-medium">{t('result.actions')}</p>
      <ul className="list-disc space-y-1 pl-5">
        {value.recommendedActions.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        {t('result.confidence', { level: t(`result.levels.${value.confidence}`) })}
      </p>
      <p className="text-xs text-muted-foreground">{t('result.disclaimer')}</p>
    </div>
  );
}

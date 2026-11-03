import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import type { FactsForModel } from '../../ai/explanation-facts.ts';
import type * as Gateway from '../../ai/gateway.ts';
import * as gateway from '../../ai/gateway.ts';
import { AI_OFF, AiExplainPanel, providerConfig, type AiSession } from './ai-explain-panel.tsx';

vi.mock('../../ai/gateway.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Gateway>()),
  explainWithAi: vi.fn(),
}));

const facts: FactsForModel = {
  materialId: 'M-100',
  materialName: 'Blech',
  severity: 'CRITICAL',
  asOf: '2026-10-05',
  criticalDate: '2026-10-13',
  erpViewDate: null,
  daysUntil: 8,
  minProjectedStock: -4,
  safetyStock: 5,
  hidden: true,
  reasonCodes: ['HIDDEN_ERP_NONE'],
  actionCodes: ['EXPEDITE'],
  supplier: null,
};

function Harness({ locale }: { readonly locale: 'de' | 'en' }) {
  const [session, setSession] = useState<AiSession>(AI_OFF);
  return (
    <NextIntlClientProvider locale={locale} messages={locale === 'de' ? de : en}>
      <AiExplainPanel session={session} onSessionChange={setSession} facts={facts} />
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('providerConfig', () => {
  it('needs a valid address and model, and a remote one also needs its own consent', () => {
    expect(providerConfig(AI_OFF)).toEqual({
      kind: 'local',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.1',
    });
    expect(providerConfig({ ...AI_OFF, localUrl: 'not a url' })).toBeNull();
    const remote: AiSession = {
      ...AI_OFF,
      mode: 'remote',
      remoteUrl: 'https://api.example.com/v1',
      remoteModel: 'm',
      apiKey: 'k',
    };
    expect(providerConfig(remote)).toBeNull();
    expect(providerConfig({ ...remote, remoteAgreed: true })).toMatchObject({ kind: 'remote' });
    expect(providerConfig({ ...remote, remoteAgreed: true, remoteUrl: 'ftp://x' })).toBeNull();
  });
});

describe.each(['de', 'en'] as const)('AiExplainPanel (%s)', (locale) => {
  const messages = (locale === 'de' ? de : en).demo.report.drawer.ai;

  it('is off by default and sends nothing', () => {
    render(<Harness locale={locale} />);
    expect(screen.getByRole('button', { name: messages.enable })).toBeTruthy();
    expect(screen.queryByRole('button', { name: messages.explain })).toBeNull();
    expect(gateway.explainWithAi).not.toHaveBeenCalled();
  });

  it('says what is sent, then waits for the click before it sends one request', async () => {
    const user = userEvent.setup();
    vi.mocked(gateway.explainWithAi).mockResolvedValue({
      ok: true,
      value: {
        summary: 'Kurz erklärt.',
        riskDrivers: ['Grund <b>1</b>'],
        recommendedActions: ['Schritt 1'],
        confidence: 'medium',
      },
    });
    render(<Harness locale={locale} />);
    await user.click(screen.getByRole('button', { name: messages.enable }));
    expect(screen.getByText(messages.consent.sendsNames)).toBeTruthy();
    expect(screen.getByText(messages.consent.notSent)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: messages.consent.activate }));
    expect(gateway.explainWithAi).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: messages.explain }));
    expect(gateway.explainWithAi).toHaveBeenCalledTimes(1);
    expect(vi.mocked(gateway.explainWithAi).mock.calls[0]?.[0]).toBe(facts);
    expect(await screen.findByText('Kurz erklärt.')).toBeTruthy();
    // Model text is plain text: markup is shown as characters, never rendered.
    expect(screen.getByText('Grund <b>1</b>')).toBeTruthy();
  });

  it('needs a separate agreement naming the host before a remote provider can be used', async () => {
    const user = userEvent.setup();
    render(<Harness locale={locale} />);
    await user.click(screen.getByRole('button', { name: messages.enable }));
    await user.click(screen.getByRole('radio', { name: messages.consent.remote }));
    await user.type(
      screen.getByLabelText(messages.consent.baseUrlRemote),
      'https://api.example.com/v1',
    );
    const activate = screen.getByRole('button', { name: messages.consent.activate });
    expect((activate as HTMLButtonElement).disabled).toBe(true);
    const agree = messages.consent.remoteAgree.replace('{host}', 'api.example.com');
    expect(screen.getByRole('checkbox', { name: agree })).toBeTruthy();
  });

  it('turns off again and forgets the key', async () => {
    const user = userEvent.setup();
    render(<Harness locale={locale} />);
    await user.click(screen.getByRole('button', { name: messages.enable }));
    await user.click(screen.getByRole('button', { name: messages.consent.activate }));
    await user.click(screen.getByRole('button', { name: messages.disable }));
    expect(screen.getByRole('button', { name: messages.enable })).toBeTruthy();
  });
});

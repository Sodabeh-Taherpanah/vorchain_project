import { z } from 'zod';

import type { LlmProvider, LlmRequest, LlmResult } from '../types.ts';
import { fail, postJson, type AdapterOptions } from './http.ts';

const ANTHROPIC_VERSION = '2023-06-01';
/** The Messages API requires `max_tokens`; this applies when the caller sets none. */
const DEFAULT_MAX_TOKENS = 1024;

const responseSchema = z.object({
  model: z.string(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  stop_reason: z.string().nullish(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
});

export interface AnthropicOptions extends AdapterOptions {
  readonly apiKey: string;
}

/** Anthropic Messages API. `baseUrl` is the host, e.g. `https://api.anthropic.com`. */
export function createAnthropicProvider(options: AnthropicOptions): LlmProvider {
  return {
    name: 'anthropic',
    async complete(request: LlmRequest): Promise<LlmResult> {
      // The Messages API takes system text as a top-level field, not as a message role.
      const system = request.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n');
      const messages = request.messages.filter((m) => m.role !== 'system');
      const out = await postJson({
        options,
        url: `${options.baseUrl}/v1/messages`,
        headers: { 'x-api-key': options.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
        body: {
          model: options.model,
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          messages,
          ...(system === '' ? {} : { system }),
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        },
        signal: request.signal,
        schema: responseSchema,
      });
      if (!out.ok) return out.result;
      const { value } = out;
      if (value.stop_reason === 'refusal') return fail('REFUSED');
      const text = value.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
      if (text === '') return fail('INVALID_RESPONSE', 'empty answer');
      return {
        ok: true,
        value: {
          text,
          model: value.model,
          ...(value.usage === undefined
            ? {}
            : {
                usage: {
                  inputTokens: value.usage.input_tokens,
                  outputTokens: value.usage.output_tokens,
                },
              }),
        },
      };
    },
  };
}

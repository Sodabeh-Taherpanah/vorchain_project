import { z } from 'zod';

import type { LlmProvider, LlmRequest, LlmResult } from '../types.ts';
import { fail, postJson, type AdapterOptions } from './http.ts';

const responseSchema = z.object({
  model: z.string(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable(), refusal: z.string().nullish() }),
        finish_reason: z.string().nullish(),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
});

export interface OpenAiCompatibleOptions extends AdapterOptions {
  /** Bearer token; omit for local servers (vLLM, LM Studio) that need none. */
  readonly apiKey?: string;
}

/** Any server speaking the OpenAI chat-completions dialect; `baseUrl` includes `/v1`. */
export function createOpenAiCompatibleProvider(options: OpenAiCompatibleOptions): LlmProvider {
  return {
    name: 'openai-compatible',
    async complete(request: LlmRequest): Promise<LlmResult> {
      const out = await postJson({
        options,
        url: `${options.baseUrl}/chat/completions`,
        headers: options.apiKey === undefined ? {} : { authorization: `Bearer ${options.apiKey}` },
        body: {
          model: options.model,
          messages: request.messages,
          ...(request.maxTokens === undefined ? {} : { max_tokens: request.maxTokens }),
          ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
        },
        signal: request.signal,
        schema: responseSchema,
      });
      if (!out.ok) return out.result;
      const { value } = out;
      const choice = value.choices[0];
      if (choice === undefined) return fail('INVALID_RESPONSE', 'no choices');
      if (choice.finish_reason === 'content_filter' || (choice.message.refusal ?? '') !== '') {
        return fail('REFUSED');
      }
      const text = choice.message.content ?? '';
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
                  inputTokens: value.usage.prompt_tokens,
                  outputTokens: value.usage.completion_tokens,
                },
              }),
        },
      };
    },
  };
}

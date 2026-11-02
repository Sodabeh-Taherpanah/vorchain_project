import { z } from 'zod';

import type { LlmProvider, LlmRequest, LlmResult } from '../types.ts';
import { fail, postJson, type AdapterOptions } from './http.ts';

const responseSchema = z.object({
  model: z.string(),
  message: z.object({ content: z.string() }),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

/** Local Ollama server (`/api/chat`, non-streaming). Customer data stays on the machine. */
export function createOllamaProvider(options: AdapterOptions): LlmProvider {
  return {
    name: 'ollama',
    async complete(request: LlmRequest): Promise<LlmResult> {
      const modelOptions: Record<string, number> = {};
      if (request.temperature !== undefined) modelOptions.temperature = request.temperature;
      if (request.maxTokens !== undefined) modelOptions.num_predict = request.maxTokens;
      const out = await postJson({
        options,
        url: `${options.baseUrl}/api/chat`,
        headers: {},
        body: {
          model: options.model,
          messages: request.messages,
          stream: false,
          options: modelOptions,
        },
        signal: request.signal,
        schema: responseSchema,
      });
      if (!out.ok) return out.result;
      const { value } = out;
      const usage =
        value.prompt_eval_count !== undefined && value.eval_count !== undefined
          ? { inputTokens: value.prompt_eval_count, outputTokens: value.eval_count }
          : undefined;
      if (value.message.content === '') return fail('INVALID_RESPONSE', 'empty answer');
      return {
        ok: true,
        value: {
          text: value.message.content,
          model: value.model,
          ...(usage === undefined ? {} : { usage }),
        },
      };
    },
  };
}

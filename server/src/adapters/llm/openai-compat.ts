import OpenAI from 'openai';
import { env } from '../../config/env.js';
import type { LLMClient, LLMStreamOptions } from './index.js';

const client = new OpenAI({
  apiKey: env.OPENAI_API_KEY || 'placeholder',
  baseURL: env.OPENAI_BASE_URL,
});

async function* streamCompletion(opts: LLMStreamOptions): AsyncIterable<string> {
  const stream = await client.chat.completions.create(
    {
      model: env.OPENAI_CHAT_MODEL,
      messages: opts.messages,
      stream: true,
      temperature: opts.temperature ?? 0.3,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    },
    opts.abortSignal ? { signal: opts.abortSignal } : undefined,
  );

  for await (const event of stream) {
    const delta = event.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export const openAiCompatLLM: LLMClient = {
  model: env.OPENAI_CHAT_MODEL,
  stream: streamCompletion,
};

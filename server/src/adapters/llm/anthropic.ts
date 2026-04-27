import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import { env } from '../../config/env.js';
import type { ChatMessage, LLMClient, LLMStreamOptions } from './index.js';

let cachedClient: Anthropic | null = null;

const getClient = (): Anthropic => {
  if (cachedClient) return cachedClient;
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      'Anthropic LLM is not configured. Set ANTHROPIC_API_KEY, or set LLM_PROVIDER=openai (works with cloud OpenAI or local Ollama via OPENAI_BASE_URL).',
    );
  }
  cachedClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return cachedClient;
};

const splitSystem = (
  messages: ChatMessage[],
): { system: string | undefined; rest: MessageParam[] } => {
  const systems = messages.filter((m) => m.role === 'system').map((m) => m.content);
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map<MessageParam>((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));
  return {
    system: systems.length > 0 ? systems.join('\n\n') : undefined,
    rest,
  };
};

async function* streamCompletion(opts: LLMStreamOptions): AsyncIterable<string> {
  const client = getClient();
  const { system, rest } = splitSystem(opts.messages);

  const stream = await client.messages.create(
    {
      model: env.ANTHROPIC_CHAT_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
      messages: rest,
      stream: true,
      ...(system ? { system } : {}),
    },
    opts.abortSignal ? { signal: opts.abortSignal } : undefined,
  );

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const text = event.delta.text;
      if (text) yield text;
    }
  }
}

export const anthropicLLM: LLMClient = {
  model: env.ANTHROPIC_CHAT_MODEL,
  stream: streamCompletion,
};

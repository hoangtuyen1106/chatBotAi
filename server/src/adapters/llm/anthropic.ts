import { env } from '../../config/env.js';
import type { LLMClient } from './index.js';

const notImplemented = (): never => {
  throw new Error(
    'Anthropic LLM adapter not implemented yet. Set LLM_PROVIDER=openai (works with cloud OpenAI or local Ollama via OPENAI_BASE_URL).',
  );
};

export const anthropicLLM: LLMClient = {
  model: env.ANTHROPIC_CHAT_MODEL,
  stream: () => notImplemented(),
};

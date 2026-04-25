import { env } from '../../config/env.js';
import type { LLMClient } from './index.js';
import { openAiCompatLLM } from './openai-compat.js';
import { anthropicLLM } from './anthropic.js';

export const getLLM = (): LLMClient =>
  env.LLM_PROVIDER === 'anthropic' ? anthropicLLM : openAiCompatLLM;

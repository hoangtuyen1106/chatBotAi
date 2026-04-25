export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMStreamOptions {
  messages: ChatMessage[];
  abortSignal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMClient {
  readonly model: string;
  stream(opts: LLMStreamOptions): AsyncIterable<string>;
}

export { getLLM } from './factory.js';

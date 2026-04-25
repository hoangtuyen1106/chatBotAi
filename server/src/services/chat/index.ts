import { getLLM } from '../../adapters/llm/index.js';
import { retrieveContext, type Citation } from '../retrieval.js';
import { buildPrompt } from './prompt.js';
import { ensureChat, recentMessages, saveExchange } from './persistence.js';

export interface ChatStreamEvents {
  onStart: (data: { chatId: string; citations: Citation[] }) => void;
  onDelta: (delta: string) => void;
  onDone: (data: { messageId: string; assistantContent: string; truncated: boolean }) => void;
  onError: (err: Error) => void;
}

export const runChatStream = async (opts: {
  userId: string;
  chatId?: string;
  message: string;
  documentId?: string;
  abortSignal: AbortSignal;
  events: ChatStreamEvents;
}): Promise<void> => {
  const { userId, message, documentId, abortSignal, events } = opts;

  try {
    const chatId = await ensureChat({
      userId,
      firstMessage: message,
      ...(opts.chatId ? { chatId: opts.chatId } : {}),
    });

    const [{ chunks, citations }, history] = await Promise.all([
      retrieveContext({
        userId,
        question: message,
        ...(documentId ? { documentId } : {}),
      }),
      recentMessages(chatId, userId),
    ]);

    events.onStart({ chatId, citations });

    const messages = buildPrompt({ question: message, chunks, history });

    let assistant = '';
    let truncated = false;
    try {
      for await (const delta of getLLM().stream({ messages, abortSignal })) {
        assistant += delta;
        events.onDelta(delta);
      }
    } catch (err) {
      if (abortSignal.aborted) {
        truncated = true;
      } else {
        throw err;
      }
    }

    if (abortSignal.aborted && !truncated) truncated = true;

    const { assistantMessageId } = await saveExchange({
      chatId,
      userId,
      userContent: message,
      assistantContent: assistant || '(no response)',
      citations,
      truncated,
    });

    events.onDone({
      messageId: assistantMessageId,
      assistantContent: assistant,
      truncated,
    });
  } catch (err) {
    events.onError(err instanceof Error ? err : new Error(String(err)));
  }
};

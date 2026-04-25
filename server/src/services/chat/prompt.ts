import type { VectorMatch } from '../../adapters/vector-store/index.js';
import type { ChatMessage } from '../../adapters/llm/index.js';

const SYSTEM_PROMPT = `Bạn là trợ lý AI trả lời câu hỏi dựa trên các đoạn tài liệu được cung cấp.
Quy tắc:
- Chỉ trả lời dựa trên các đoạn [#1], [#2]... bên dưới. Nếu thông tin không có trong tài liệu, nói rõ "Tôi không tìm thấy thông tin này trong tài liệu của bạn."
- Trích dẫn nguồn bằng cú pháp [#n] ngay sau câu sử dụng thông tin từ đoạn đó.
- Trả lời ngắn gọn, đúng trọng tâm. Trả lời cùng ngôn ngữ với câu hỏi của người dùng.`;

const formatChunks = (chunks: VectorMatch[]): string => {
  if (chunks.length === 0) return '(Không có đoạn tài liệu nào liên quan.)';
  return chunks
    .map(
      (c, i) => `[#${i + 1}] (doc=${c.documentId.slice(0, 8)} chunk=${c.chunkIndex})\n${c.content}`,
    )
    .join('\n\n---\n\n');
};

export const buildPrompt = (opts: {
  question: string;
  chunks: VectorMatch[];
  history: ChatMessage[];
}): ChatMessage[] => {
  const contextBlock = `Các đoạn tài liệu liên quan:\n\n${formatChunks(opts.chunks)}`;
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: contextBlock },
    ...opts.history,
    { role: 'user', content: opts.question },
  ];
};

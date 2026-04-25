export interface Chunk {
  index: number;
  content: string;
  tokenEstimate: number;
}

const TARGET_CHARS = 2000;
const OVERLAP_CHARS = 200;
const MIN_CHARS = 100;

const estimateTokens = (s: string): number => Math.ceil(s.length / 3.5);

const splitParagraphs = (text: string): string[] =>
  text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

export const chunk = (rawText: string): Chunk[] => {
  const text = rawText.trim();
  if (!text) return [];

  const paragraphs = splitParagraphs(text);
  const chunks: Chunk[] = [];
  let buf = '';
  let index = 0;

  const flush = (): void => {
    const trimmed = buf.trim();
    if (trimmed.length < MIN_CHARS && chunks.length > 0) {
      chunks[chunks.length - 1].content += '\n' + trimmed;
      chunks[chunks.length - 1].tokenEstimate = estimateTokens(chunks[chunks.length - 1].content);
      buf = '';
      return;
    }
    if (!trimmed) return;
    chunks.push({ index, content: trimmed, tokenEstimate: estimateTokens(trimmed) });
    index += 1;
    buf = trimmed.slice(-OVERLAP_CHARS);
  };

  for (const p of paragraphs) {
    if (buf.length + p.length + 1 > TARGET_CHARS) {
      flush();
    }
    buf += (buf ? '\n\n' : '') + p;
    while (buf.length > TARGET_CHARS) {
      const slice = buf.slice(0, TARGET_CHARS);
      const breakAt = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '));
      const cut = breakAt > MIN_CHARS ? breakAt + 1 : TARGET_CHARS;
      const piece = buf.slice(0, cut).trim();
      chunks.push({ index, content: piece, tokenEstimate: estimateTokens(piece) });
      index += 1;
      buf = piece.slice(-OVERLAP_CHARS) + buf.slice(cut);
    }
  }
  if (buf.trim()) flush();

  return chunks;
};

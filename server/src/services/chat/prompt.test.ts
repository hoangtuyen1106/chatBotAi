import { describe, expect, it } from 'vitest';
import { buildPrompt } from './prompt.js';
import type { VectorMatch } from '../../adapters/vector-store/index.js';

const match = (i: number, content: string): VectorMatch => ({
  id: `id-${i}`,
  documentId: '11111111-2222-3333-4444-555555555555',
  chunkIndex: i,
  content,
  score: 0.9 - i * 0.05,
});

describe('buildPrompt', () => {
  it('emits system + context + history + user-question in order', () => {
    const out = buildPrompt({
      question: 'Câu hỏi?',
      chunks: [match(0, 'alpha'), match(1, 'beta')],
      history: [
        { role: 'user', content: 'trước đó' },
        { role: 'assistant', content: 'trả lời' },
      ],
    });
    expect(out).toHaveLength(5);
    expect(out[0].role).toBe('system');
    expect(out[0].content).toContain('[#1]');
    expect(out[1].role).toBe('system');
    expect(out[1].content).toContain('[#1]');
    expect(out[1].content).toContain('alpha');
    expect(out[1].content).toContain('[#2]');
    expect(out[1].content).toContain('beta');
    expect(out[2]).toEqual({ role: 'user', content: 'trước đó' });
    expect(out[3]).toEqual({ role: 'assistant', content: 'trả lời' });
    expect(out[4]).toEqual({ role: 'user', content: 'Câu hỏi?' });
  });

  it('shows a fallback context block when no chunks are retrieved', () => {
    const out = buildPrompt({ question: 'q', chunks: [], history: [] });
    expect(out[1].content).toContain('Không có');
  });
});

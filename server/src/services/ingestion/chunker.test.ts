import { describe, expect, it } from 'vitest';
import { chunk } from './chunker.js';

describe('chunker', () => {
  it('returns empty array for empty input', () => {
    expect(chunk('')).toEqual([]);
    expect(chunk('   \n\n  ')).toEqual([]);
  });

  it('produces a single chunk for short text', () => {
    const out = chunk('Hello world. This is a small document.');
    expect(out).toHaveLength(1);
    expect(out[0].index).toBe(0);
    expect(out[0].content).toContain('Hello world');
    expect(out[0].tokenEstimate).toBeGreaterThan(0);
  });

  it('keeps chunk size near target with overlap on long input', () => {
    const para = 'Câu mẫu rất dài. '.repeat(200);
    const text = [para, para, para].join('\n\n');
    const out = chunk(text);
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) {
      expect(c.content.length).toBeLessThanOrEqual(2200);
    }
    expect(out.map((c) => c.index)).toEqual(out.map((_, i) => i));
  });

  it('merges trailing tiny chunk into the previous one', () => {
    const big = 'A'.repeat(1900);
    const tiny = 'B'.repeat(20);
    const out = chunk(`${big}\n\n${tiny}`);
    expect(out).toHaveLength(1);
    expect(out[0].content).toContain('AAA');
    expect(out[0].content).toContain('BB');
  });

  it('estimates tokens proportional to length', () => {
    const out = chunk('x'.repeat(700));
    expect(out[0].tokenEstimate).toBe(Math.ceil(700 / 3.5));
  });
});

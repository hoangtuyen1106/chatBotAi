import Papa from 'papaparse';

export const parseCsv = (buf: Buffer): Promise<string> => {
  const text = buf.toString('utf-8');
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return Promise.resolve(parsed.data.map((row) => row.join(' | ')).join('\n'));
};

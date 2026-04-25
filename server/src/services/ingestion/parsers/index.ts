import { parsePdf } from './pdf.js';
import { parseDocx } from './docx.js';
import { parseCsv } from './csv.js';
import { parseTxt } from './txt.js';

export type Parser = (buf: Buffer) => Promise<string>;

export const PARSERS: Record<string, Parser> = {
  'application/pdf': parsePdf,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': parseDocx,
  'text/csv': parseCsv,
  'text/plain': parseTxt,
};

export const isSupportedMime = (mime: string): boolean => mime in PARSERS;

export const getParser = (mime: string): Parser => {
  const p = PARSERS[mime];
  if (!p) throw new Error(`No parser registered for mime ${mime}`);
  return p;
};

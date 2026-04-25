// pdf-parse's main entry has a debug block that opens a sample PDF on import.
// Importing the inner module avoids that side effect.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - no types for inner path
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

interface PdfResult {
  text?: string;
}

export const parsePdf = async (buf: Buffer): Promise<string> => {
  const out: PdfResult = await (pdfParse as (b: Buffer) => Promise<PdfResult>)(buf);
  return out.text ?? '';
};

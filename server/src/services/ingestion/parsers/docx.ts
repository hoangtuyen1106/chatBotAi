import mammoth from 'mammoth';

export const parseDocx = async (buf: Buffer): Promise<string> => {
  const out = await mammoth.extractRawText({ buffer: buf });
  return out.value ?? '';
};

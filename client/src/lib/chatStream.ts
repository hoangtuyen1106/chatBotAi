import { apiUrl, getToken } from './api';

export interface Citation {
  chunkId: string;
  documentId: string;
  chunkIndex: number;
  score: number;
  preview: string;
}

export interface StreamCallbacks {
  onOpen?: () => void;
  onStart?: (data: { chatId: string; citations: Citation[] }) => void;
  onDelta?: (delta: string) => void;
  onDone?: (data: { messageId: string; assistantContent: string; truncated: boolean }) => void;
  onError?: (message: string) => void;
}

interface SsePacket {
  event: string;
  data: string;
}

const parseSse = (chunk: string): SsePacket[] => {
  const out: SsePacket[] = [];
  for (const block of chunk.split(/\n\n/)) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length > 0) out.push({ event, data: dataLines.join('\n') });
  }
  return out;
};

export const streamChat = async (
  body: { message: string; chatId?: string; documentId?: string },
  cbs: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> => {
  const token = getToken();
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  };
  if (signal) init.signal = signal;
  const res = await fetch(apiUrl('/chat/stream'), init);

  if (!res.ok || !res.body) {
    const text = await res.text();
    cbs.onError?.(text || `HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const split = buf.lastIndexOf('\n\n');
      if (split === -1) continue;
      const ready = buf.slice(0, split + 2);
      buf = buf.slice(split + 2);
      for (const pkt of parseSse(ready)) {
        if (pkt.data === '' || pkt.event === 'ping') continue;
        try {
          const json = JSON.parse(pkt.data) as Record<string, unknown>;
          if (pkt.event === 'open') cbs.onOpen?.();
          else if (pkt.event === 'start')
            cbs.onStart?.(json as unknown as { chatId: string; citations: Citation[] });
          else if (pkt.event === 'delta')
            cbs.onDelta?.(typeof json.delta === 'string' ? json.delta : '');
          else if (pkt.event === 'done')
            cbs.onDone?.(
              json as unknown as { messageId: string; assistantContent: string; truncated: boolean },
            );
          else if (pkt.event === 'error')
            cbs.onError?.(typeof json.message === 'string' ? json.message : 'stream error');
        } catch {
          /* skip malformed */
        }
      }
    }
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') return;
    cbs.onError?.(err instanceof Error ? err.message : 'stream failed');
  }
};

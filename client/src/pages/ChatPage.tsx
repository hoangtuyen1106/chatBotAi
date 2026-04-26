import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Send, Loader2, Sparkles } from 'lucide-react';

import { AppShell } from '@/components/AppShell';
import { HistorySidebar } from '@/components/HistorySidebar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api, ApiError } from '@/lib/api';
import { streamChat, type Citation } from '@/lib/chatStream';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  truncated?: boolean;
  streaming?: boolean;
}

interface PersistedMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: Citation[] | null;
  truncated: boolean;
  createdAt: string;
}

export const ChatPage = () => {
  const { id: chatIdParam } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  // Load existing chat messages when chatId changes.
  useEffect(() => {
    if (!chatIdParam) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    api<{ messages: PersistedMessage[] }>(`/chats/${chatIdParam}/messages?limit=200`)
      .then((r) => {
        if (cancelled) return;
        setMessages(
          r.messages
            .filter((m) => m.role !== 'system')
            .map<UiMessage>((m) => {
              const ui: UiMessage = {
                id: m.id,
                role: m.role as 'user' | 'assistant',
                content: m.content,
                truncated: m.truncated,
              };
              if (m.citations) ui.citations = m.citations;
              return ui;
            }),
        );
      })
      .catch(() => {
        if (!cancelled) toast({ variant: 'destructive', title: 'Không tải được cuộc trò chuyện' });
      });
    return () => {
      cancelled = true;
    };
  }, [chatIdParam]);

  // Auto-scroll behaviour: stick unless user scrolls up.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    stickToBottomRef.current = true;
    const tempUserId = `u-${Date.now()}`;
    const tempAssistantId = `a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: tempUserId, role: 'user', content: text },
      { id: tempAssistantId, role: 'assistant', content: '', streaming: true },
    ]);
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    let acquiredChatId: string | undefined;
    try {
      await streamChat(
        chatIdParam ? { message: text, chatId: chatIdParam } : { message: text },
        {
          onStart: ({ chatId, citations }) => {
            acquiredChatId = chatId;
            setMessages((m) =>
              m.map((msg) => (msg.id === tempAssistantId ? { ...msg, citations } : msg)),
            );
          },
          onDelta: (d) => {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === tempAssistantId ? { ...msg, content: msg.content + d } : msg,
              ),
            );
          },
          onDone: ({ messageId, truncated }) => {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === tempAssistantId
                  ? { ...msg, id: messageId, streaming: false, truncated }
                  : msg,
              ),
            );
          },
          onError: (msg) => {
            toast({ variant: 'destructive', title: 'Lỗi chat', description: msg });
          },
        },
        controller.signal,
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Stream lỗi';
      toast({ variant: 'destructive', title: 'Lỗi chat', description: msg });
    } finally {
      setStreaming(false);
      abortRef.current = null;
      setHistoryKey((k) => k + 1);
      if (!chatIdParam && acquiredChatId) navigate(`/chat/${acquiredChatId}`, { replace: true });
    }
  }, [input, streaming, chatIdParam, navigate]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return (
    <AppShell sidebar={<HistorySidebar refreshKey={historyKey} />}>
      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="flex-1">
          <div ref={scrollRef} onScroll={onScroll} className="mx-auto h-full max-w-3xl px-4 py-6">
            {messages.length === 0 ? (
              <div className="mt-12 flex flex-col items-center gap-2 text-center text-muted-foreground">
                <Sparkles className="h-8 w-8" />
                <p className="text-sm">Hỏi về tài liệu của bạn để bắt đầu.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t bg-background">
          <div className="mx-auto flex max-w-3xl items-end gap-2 p-3 sm:p-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Hỏi gì đó về tài liệu của bạn…"
              rows={1}
              className="max-h-40 min-h-[40px] resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            {streaming ? (
              <Button variant="outline" size="icon" onClick={stop} aria-label="Dừng">
                <Loader2 className="h-4 w-4 animate-spin" />
              </Button>
            ) : (
              <Button onClick={() => void send()} disabled={!input.trim()} size="icon" aria-label="Gửi">
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
};

const MessageBubble = ({ message }: { message: UiMessage }) => {
  const isUser = message.role === 'user';
  return (
    <div
      className={cn(
        'flex animate-fade-in flex-col gap-1 motion-reduce:animate-none',
        isUser ? 'items-end' : 'items-start',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm shadow-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground',
        )}
      >
        {message.content || (message.streaming ? '…' : '')}
        {message.truncated && (
          <span className="ml-2 text-xs opacity-70">[bị ngắt]</span>
        )}
      </div>
      {message.citations && message.citations.length > 0 ? (
        <CitationsList citations={message.citations} />
      ) : null}
    </div>
  );
};

const CitationsList = ({ citations }: { citations: Citation[] }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="max-w-[85%]">
      <button
        type="button"
        aria-expanded={open}
        className="rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Ẩn nguồn' : `Xem ${citations.length} nguồn`}
      </button>
      {open ? (
        <ul className="mt-1 space-y-1.5">
          {citations.map((c, i) => (
            <li key={c.chunkId} className="rounded-md border bg-muted/30 p-2 text-xs">
              <div className="font-medium">
                [#{i + 1}] doc {c.documentId.slice(0, 8)} · chunk {c.chunkIndex} · score{' '}
                {c.score.toFixed(2)}
              </div>
              <p className="mt-1 text-muted-foreground">{c.preview}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

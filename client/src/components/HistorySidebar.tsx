import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, MessageSquare } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ChatSummary {
  id: string;
  title: string | null;
  updatedAt: string;
  createdAt: string;
}

export const HistorySidebar = ({ refreshKey }: { refreshKey: number }) => {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { id: activeId } = useParams();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ chats: ChatSummary[] }>('/history?limit=30')
      .then((r) => {
        if (!cancelled) setChats(r.chats);
      })
      .catch(() => {
        if (!cancelled) setChats([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <Button className="w-full" size="sm" onClick={() => navigate('/chat')}>
          <Plus className="h-4 w-4" /> Cuộc trò chuyện mới
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="space-y-1 p-2" aria-label="Đang tải lịch sử">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : chats.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">Chưa có cuộc trò chuyện nào.</p>
        ) : (
          <ul className="space-y-0.5 p-2">
            {chats.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => navigate(`/chat/${c.id}`)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent',
                    activeId === c.id && 'bg-accent',
                  )}
                >
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="line-clamp-2 flex-1 text-xs leading-snug">
                    {c.title ?? 'Cuộc trò chuyện'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
};

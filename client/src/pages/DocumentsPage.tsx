import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';

import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { api, apiFetch, ApiError, getToken } from '@/lib/api';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

interface DocumentRow {
  id: string;
  filename: string;
  mime: string;
  size_bytes: string | number;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  chunk_count: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'text/plain',
]);
const MAX_MB = 25;

const formatBytes = (raw: string | number): string => {
  const b = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(b)) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

export const DocumentsPage = () => {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ documents: DocumentRow[] }>('/documents');
      setDocs(data.documents);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Không tải được danh sách';
      toast({ variant: 'destructive', title: 'Lỗi', description: msg });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const hasPending = docs.some((d) => d.status === 'pending' || d.status === 'processing');
    if (!hasPending) return;
    const id = setInterval(() => void refresh(), 2000);
    return () => clearInterval(id);
  }, [docs, refresh]);

  const upload = useCallback(
    async (file: File) => {
      if (file.size > MAX_MB * 1024 * 1024) {
        toast({ variant: 'destructive', title: 'File quá lớn', description: `Tối đa ${MAX_MB} MB` });
        return;
      }
      if (file.type && !ALLOWED_MIME.has(file.type)) {
        toast({ variant: 'destructive', title: 'Định dạng không hỗ trợ', description: file.type });
        return;
      }
      setUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        const token = getToken();
        const init: RequestInit = { method: 'POST', body: form };
        if (token) init.headers = { Authorization: `Bearer ${token}` };
        const res = await apiFetch('/upload', init);
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        toast({ title: 'Đã tải lên', description: file.name });
        await refresh();
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Tải lên thất bại',
          description: err instanceof Error ? err.message : 'Lỗi không xác định',
        });
      } finally {
        setUploading(false);
      }
    },
    [refresh],
  );

  return (
    <AppShell>
      <div className="container mx-auto flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <div>
          <h1 className="text-xl font-semibold">Tài liệu của bạn</h1>
          <p className="text-sm text-muted-foreground">PDF, DOCX, CSV, TXT — tối đa {MAX_MB} MB.</p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void upload(f);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/20',
          )}
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Kéo thả file vào đây hoặc</p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.csv,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,text/plain"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải lên…
              </>
            ) : (
              'Chọn file'
            )}
          </Button>
        </div>

        <ScrollArea className="-mx-4 flex-1 px-4 sm:mx-0 sm:px-0">
          {loading ? (
            <div className="space-y-2" aria-label="Đang tải tài liệu">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Chưa có tài liệu nào.
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 p-3">
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(d.size_bytes)} · {d.chunk_count} chunks ·{' '}
                      {new Date(d.created_at).toLocaleString('vi-VN')}
                    </p>
                    {d.error ? (
                      <p className="mt-1 text-xs text-destructive">{d.error}</p>
                    ) : null}
                  </div>
                  <StatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>
    </AppShell>
  );
};

const StatusBadge = ({ status }: { status: DocumentRow['status'] }) => {
  const map: Record<DocumentRow['status'], { label: string; className: string; Icon: typeof Loader2 }> = {
    pending: { label: 'Đang chờ', className: 'bg-muted text-muted-foreground', Icon: Loader2 },
    processing: { label: 'Đang xử lý', className: 'bg-amber-100 text-amber-900', Icon: Loader2 },
    ready: { label: 'Sẵn sàng', className: 'bg-emerald-100 text-emerald-900', Icon: CheckCircle2 },
    failed: { label: 'Lỗi', className: 'bg-destructive/10 text-destructive', Icon: AlertCircle },
  };
  const { label, className, Icon } = map[status];
  const spin = status === 'pending' || status === 'processing';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs', className)}>
      <Icon className={cn('h-3 w-3', spin && 'animate-spin')} /> {label}
    </span>
  );
};

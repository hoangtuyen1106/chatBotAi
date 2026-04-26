import { Link } from 'react-router-dom';
import {
  ArrowRight,
  FileText,
  Sparkles,
  Quote,
  ShieldCheck,
  Database,
  Upload,
  MessageSquare,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Reveal } from '@/components/Reveal';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/lib/auth';

const features = [
  {
    icon: FileText,
    title: 'Đa định dạng',
    desc: 'Tải lên PDF, DOCX, CSV hoặc TXT — hệ thống tự bóc tách và lập chỉ mục.',
  },
  {
    icon: Sparkles,
    title: 'Hỏi đáp ngữ cảnh',
    desc: 'Trợ lý chỉ trả lời dựa trên chính tài liệu của bạn, không đoán mò.',
  },
  {
    icon: Quote,
    title: 'Trích dẫn rõ ràng',
    desc: 'Mỗi câu trả lời kèm tham chiếu [#n] về đúng đoạn văn nguồn.',
  },
  {
    icon: ShieldCheck,
    title: 'Local-first',
    desc: 'Chạy hoàn toàn trên Ollama nội bộ — dữ liệu không rời máy bạn.',
  },
];

const steps = [
  {
    icon: Upload,
    title: 'Tải tài liệu',
    desc: 'Kéo thả file của bạn vào trình duyệt, tối đa 25 MB mỗi file.',
  },
  {
    icon: Database,
    title: 'Bóc tách & lập chỉ mục',
    desc: 'Nội dung được chia thành các đoạn rồi nhúng vector vào pgvector.',
  },
  {
    icon: MessageSquare,
    title: 'Hỏi và nhận câu trả lời',
    desc: 'Trợ lý truy xuất các đoạn liên quan và trả lời kèm trích dẫn.',
  },
];

export const LandingPage = () => {
  const { token } = useAuth();
  const ctaTo = token ? '/chat' : '/register';
  const ctaLabel = token ? 'Mở ứng dụng' : 'Bắt đầu miễn phí';

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 items-center justify-between">
          <Link to="/" className="text-sm font-semibold tracking-widest text-primary">
            CHATBOT AI
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {token ? (
              <Button asChild size="sm">
                <Link to="/chat">Vào ứng dụng</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Đăng nhập</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/register">Đăng ký</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="container mx-auto px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <Reveal>
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" /> RAG cục bộ với Ollama
              </span>
            </Reveal>
            <Reveal delayMs={80}>
              <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
                Trò chuyện với tài liệu của bạn — không gửi đi đâu cả.
              </h1>
            </Reveal>
            <Reveal delayMs={160}>
              <p className="mt-4 text-pretty text-base text-muted-foreground sm:text-lg">
                Tải lên tài liệu, hỏi bằng tiếng Việt, nhận câu trả lời có trích dẫn từ chính các
                đoạn văn bạn đã cung cấp.
              </p>
            </Reveal>
            <Reveal delayMs={240}>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="w-full sm:w-auto">
                  <Link to={ctaTo}>
                    {ctaLabel} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                  <Link to="/login">Tôi đã có tài khoản</Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="container mx-auto px-4 py-16 sm:py-20">
            <Reveal className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tính năng chính</h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                Một trợ lý đơn giản, có chừng mực, ưu tiên độ chính xác và quyền riêng tư.
              </p>
            </Reveal>
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((f, i) => (
                <Reveal key={f.title} delayMs={i * 80}>
                  <Card className="h-full">
                    <CardHeader>
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <f.icon className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-lg">{f.title}</CardTitle>
                      <CardDescription>{f.desc}</CardDescription>
                    </CardHeader>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t">
          <div className="container mx-auto px-4 py-16 sm:py-20">
            <Reveal className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cách hoạt động</h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                Ba bước, không có cấu hình phức tạp.
              </p>
            </Reveal>
            <ol className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
              {steps.map((s, i) => (
                <Reveal key={s.title} delayMs={i * 100} as="li">
                  <div className="flex flex-col items-start gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold tabular-nums">
                        {i + 1}
                      </span>
                      <s.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="text-lg font-medium">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t bg-primary/5">
          <div className="container mx-auto px-4 py-16 sm:py-20">
            <Reveal className="mx-auto max-w-xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Sẵn sàng thử ngay?
              </h2>
              <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                Tạo tài khoản, tải lên tài liệu đầu tiên, và bắt đầu trò chuyện.
              </p>
              <div className="mt-6">
                <Button asChild size="lg">
                  <Link to={ctaTo}>
                    {ctaLabel} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="container mx-auto flex flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} ChatBot AI</span>
          <span>Local-first RAG · Ollama · pgvector</span>
        </div>
      </footer>
    </div>
  );
};

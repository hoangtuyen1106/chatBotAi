import { Link, NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { LogOut, MessageSquare, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

const links = [
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/documents', label: 'Tài liệu', icon: FileText },
];

export const AppShell = ({ sidebar, children }: { sidebar?: ReactNode; children: ReactNode }) => {
  const { user, logout } = useAuth();
  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm font-semibold tracking-widest text-primary">
            CHATBOT AI
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-accent',
                  )
                }
              >
                <l.icon className="h-4 w-4" /> {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">{user?.email}</span>
          <Button variant="ghost" size="icon" aria-label="Đăng xuất" onClick={logout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>
      <nav className="flex border-b sm:hidden">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              cn(
                'flex flex-1 items-center justify-center gap-1.5 py-2 text-sm',
                isActive ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground',
              )
            }
          >
            <l.icon className="h-4 w-4" /> {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1">
        {sidebar ? <aside className="hidden w-64 shrink-0 border-r md:block">{sidebar}</aside> : null}
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
};

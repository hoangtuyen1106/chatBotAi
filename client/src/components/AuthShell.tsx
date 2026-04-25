import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const AuthShell = ({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) => (
  <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1.5 text-center">
        <Link to="/" className="text-xs font-semibold tracking-widest text-primary">
          CHATBOT AI
        </Link>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        <div className="text-center text-sm text-muted-foreground">{footer}</div>
      </CardContent>
    </Card>
  </div>
);

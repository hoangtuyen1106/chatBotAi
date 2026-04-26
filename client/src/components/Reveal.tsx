import { createElement, type ReactNode, type CSSProperties } from 'react';
import { useReveal } from '@/lib/reveal';
import { cn } from '@/lib/utils';

export const Reveal = ({
  children,
  className,
  delayMs = 0,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  as?: 'div' | 'section' | 'li' | 'ul' | 'header' | 'footer' | 'article' | 'span';
}) => {
  const { ref, inView } = useReveal<HTMLDivElement>();
  const style: CSSProperties = { transitionDelay: `${delayMs}ms` };
  return createElement(
    as,
    {
      ref,
      style,
      className: cn(
        'transition-all duration-500 ease-out motion-reduce:transition-none',
        inView ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        className,
      ),
    },
    children,
  );
};

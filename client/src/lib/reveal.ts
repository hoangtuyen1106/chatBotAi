import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Returns a ref to attach to any element + a boolean that flips to true the first
 * time the element scrolls into view. Honors `prefers-reduced-motion: reduce` by
 * starting in the visible state so animations are skipped.
 */
export const useReveal = <T extends HTMLElement = HTMLDivElement>(
  options: IntersectionObserverInit = {},
): { ref: React.RefObject<T>; inView: boolean } => {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState<boolean>(() => prefersReducedMotion());

  useEffect(() => {
    if (inView) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px', ...options },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, options]);

  return { ref, inView };
};

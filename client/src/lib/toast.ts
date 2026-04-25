import * as React from 'react';
import type { ToastVariant } from '@/components/ui/toast';

export interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<Listener>();

const notify = (): void => {
  for (const l of listeners) l(toasts);
};

export const toast = (input: Omit<ToastItem, 'id'>): string => {
  const id = Math.random().toString(36).slice(2);
  toasts = [...toasts, { ...input, id }];
  notify();
  return id;
};

export const dismissToast = (id: string): void => {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
};

export const useToasts = (): ToastItem[] => {
  const [state, setState] = React.useState<ToastItem[]>(toasts);
  React.useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
};

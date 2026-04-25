import { Toast, ToastClose, ToastDescription, ToastTitle } from '@/components/ui/toast';
import { dismissToast, useToasts } from '@/lib/toast';

export const ToasterMount = () => {
  const items = useToasts();
  return (
    <>
      {items.map((t) => (
        <Toast
          key={t.id}
          variant={t.variant ?? 'default'}
          duration={t.duration ?? 4000}
          onOpenChange={(open) => {
            if (!open) dismissToast(t.id);
          }}
        >
          <div className="grid gap-1">
            {t.title ? <ToastTitle>{t.title}</ToastTitle> : null}
            {t.description ? <ToastDescription>{t.description}</ToastDescription> : null}
          </div>
          <ToastClose />
        </Toast>
      ))}
    </>
  );
};

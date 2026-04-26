import { Moon, Sun, Laptop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme, type Theme } from '@/lib/theme';

const NEXT: Record<Theme, Theme> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const labelFor = (t: Theme): string =>
  t === 'light' ? 'Sáng' : t === 'dark' ? 'Tối' : 'Theo hệ thống';

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Laptop;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(NEXT[theme])}
      aria-label={`Chế độ: ${labelFor(theme)}. Bấm để đổi.`}
      title={`Chế độ: ${labelFor(theme)}`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
};

/**
 * apps/web/src/components/ThemeToggle.tsx
 *
 * Theme toggle button switching between light and dark modes via useRevOpsStore.
 */

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { cn } from '@/lib/utils';

export interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const theme = useRevOpsStore((s) => s.theme);
  const toggleTheme = useRevOpsStore((s) => s.toggleTheme);

  // If theme is dark (or system evaluating to dark), show Sun so user can switch to light
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label="Переключить тему"
      className={cn(
        'h-8 w-8 rounded-lg text-secondary hover:bg-hover hover:text-foreground transition-colors duration-150',
        className
      )}
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5 transition-transform" data-testid="icon-sun" />
      ) : (
        <Moon
          className="h-3.5 w-3.5 transition-transform"
          data-testid="icon-moon"
        />
      )}
    </Button>
  );
}

export default ThemeToggle;

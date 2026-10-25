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
      size="sm"
      onClick={toggleTheme}
      aria-label="Переключить тему"
      title={
        isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'
      }
      className={cn(
        'bg-hover/80 shadow-xs group h-8 gap-2 rounded-lg border border-subtle px-2.5 text-xs font-medium text-secondary transition-all duration-150 hover:border-strong hover:bg-hover hover:text-foreground',
        className
      )}
    >
      {isDark ? (
        <>
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
            <Sun className="h-3 w-3" data-testid="icon-sun" />
          </span>
          <span className="hidden font-normal text-secondary group-hover:text-foreground sm:inline">
            Светлая тема
          </span>
        </>
      ) : (
        <>
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-500/15 text-violet-600">
            <Moon className="h-3 w-3" data-testid="icon-moon" />
          </span>
          <span className="hidden font-normal text-secondary group-hover:text-foreground sm:inline">
            Тёмная тема
          </span>
        </>
      )}
    </Button>
  );
}

export default ThemeToggle;

/**
 * apps/web/src/layouts/Header.tsx
 *
 * Application top bar containing TenantSelector, ThemeToggle,
 * WebSocket connection status indicator, and user profile badge.
 */

import { Badge } from '@/components/ui/badge';
import { TenantSelector } from '@/components/TenantSelector';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { cn } from '@/lib/utils';

export interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const websocketStatus = useRevOpsStore((s) => s.websocketStatus);
  const user = useRevOpsStore((s) => s.user);

  const statusColor =
    {
      connected: 'bg-emerald-500',
      connecting: 'bg-amber-500',
      disconnected: 'bg-muted-foreground',
    }[websocketStatus] || 'bg-muted-foreground';

  return (
    <header
      className={cn(
        'flex h-14 w-full items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        className
      )}
      data-testid="app-header"
    >
      {/* Left side: tenant selector */}
      <div className="flex items-center space-x-4">
        <TenantSelector />
      </div>

      {/* Right side: theme toggle, websocket status, user menu */}
      <div className="flex items-center space-x-3">
        <div
          className="text-muted-foreground flex items-center space-x-1.5 px-2 py-1 text-xs"
          title={`WebSocket: ${websocketStatus}`}
          data-testid="websocket-status-indicator"
        >
          <div
            className={cn('h-2 w-2 rounded-full', statusColor)}
            data-testid="websocket-status-dot"
          />
          <span className="hidden font-mono text-[11px] capitalize sm:inline">
            {websocketStatus}
          </span>
        </div>

        <ThemeToggle />

        <div className="pl-1">
          {user?.name ? (
            <Badge
              variant="secondary"
              className="text-xs font-normal"
              data-testid="user-badge"
            >
              {user.name}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-muted-foreground text-xs font-normal"
              data-testid="user-badge"
            >
              Войти
            </Badge>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;

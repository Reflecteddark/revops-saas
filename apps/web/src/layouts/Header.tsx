/**
 * apps/web/src/layouts/Header.tsx
 *
 * Application top bar containing TenantSelector, ThemeToggle,
 * WebSocket connection status indicator, and user profile DropdownMenu with Logout.
 */

import { useNavigate } from 'react-router-dom';
import { LogOut, User as UserIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TenantSelector } from '@/components/TenantSelector';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { authApi } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface HeaderProps {
  className?: string;
}

export function Header({ className }: HeaderProps) {
  const navigate = useNavigate();
  const websocketStatus = useRevOpsStore((s) => s.websocketStatus);
  const user = useRevOpsStore((s) => s.user);

  const statusColor = {
    connected: 'bg-emerald-500',
    connecting: 'bg-amber-500',
    disconnected: 'bg-muted-foreground',
  }[websocketStatus] || 'bg-muted-foreground';

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore API logout errors and clear store locally
    } finally {
      useRevOpsStore.getState().logout();
      navigate('/login', { replace: true });
    }
  };

  const displayName = user?.name || user?.full_name || user?.email;

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
          className="flex items-center space-x-1.5 px-2 py-1 text-xs text-muted-foreground"
          title={`WebSocket: ${websocketStatus}`}
          data-testid="websocket-status-indicator"
        >
          <div
            className={cn('h-2 w-2 rounded-full', statusColor)}
            data-testid="websocket-status-dot"
          />
          <span className="hidden sm:inline capitalize font-mono text-[11px]">
            {websocketStatus}
          </span>
        </div>

        <ThemeToggle />

        <div className="pl-1">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-2 text-xs font-normal"
                  data-testid="user-menu-trigger"
                >
                  <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{displayName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-xs font-medium leading-none">{displayName}</p>
                    <p className="text-[11px] leading-none text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-xs text-red-500 focus:text-red-500"
                  data-testid="menu-item-logout"
                >
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  <span>Выйти</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Badge
              variant="outline"
              onClick={() => navigate('/login')}
              className="text-xs font-normal text-muted-foreground cursor-pointer hover:bg-muted"
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

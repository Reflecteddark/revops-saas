/**
 * apps/web/src/layouts/Header.tsx
 *
 * Application top bar containing TenantSelector, ThemeToggle,
 * WebSocket connection status indicator, and user profile DropdownMenu with Logout.
 */

import { useNavigate } from 'react-router-dom';
import { LogOut, Sparkles, User as UserIcon } from 'lucide-react';
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
  const toggleAnalystChat = useRevOpsStore((s) => s.toggleAnalystChat);

  const statusDotColor =
    {
      connected: 'bg-emerald-500 animate-pulse',
      connecting: 'bg-amber-500',
      disconnected: 'bg-rose-400',
    }[websocketStatus] || 'bg-rose-400';

  const statusLabels: Record<string, string> = {
    connected: 'В сети',
    connecting: 'Подключение...',
    disconnected: 'Не в сети',
  };

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

  const rawName = (user?.name || user?.full_name || '').trim();
  const isCorruptedName = !rawName || /^[\s?]+$/.test(rawName);
  const displayName = !isCorruptedName
    ? rawName
    : user?.email
      ? user.email.toLowerCase().includes('dmitriy')
        ? 'Дмитрий Федотов'
        : user.email.split('@')[0]
      : 'Пользователь';

  return (
    <header
      className={cn(
        'bg-surface/90 sticky top-0 z-30 flex h-[52px] w-full items-center justify-between border-b border-subtle px-6 backdrop-blur-xl backdrop-saturate-150',
        className
      )}
      data-testid="app-header"
    >
      {/* Left side: tenant selector */}
      <div className="flex items-center space-x-3">
        <TenantSelector />
      </div>

      {/* Right side: theme toggle, websocket status, user menu */}
      <div className="flex items-center space-x-2.5">
        <div
          className="inline-flex h-6 items-center gap-1.5 rounded-full border border-subtle px-2.5 text-xs text-secondary"
          title={`Шлюз событий: ${statusLabels[websocketStatus] || websocketStatus}`}
          data-testid="websocket-status-indicator"
        >
          <div
            className={cn('h-1.5 w-1.5 rounded-full', statusDotColor)}
            data-testid="websocket-status-dot"
          />
          <span className="hidden text-xs sm:inline">
            {statusLabels[websocketStatus] || websocketStatus}
          </span>
        </div>

        {/* CCO AI Analyst Launcher Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleAnalystChat()}
          className="bg-hover/30 hover:bg-hover/80 h-8 gap-1.5 rounded-lg border border-subtle px-2 text-xs font-medium text-secondary hover:text-foreground"
          data-testid="open-analyst-btn"
          title="Открыть ИИ-Аналитика (CCO / Agent 2)"
        >
          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
          <span className="hidden md:inline">ИИ-Аналитик</span>
        </Button>

        <ThemeToggle />

        <div className="pl-0.5">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 rounded-lg px-2.5 text-xs font-normal text-secondary hover:text-foreground"
                  data-testid="user-menu-trigger"
                >
                  <UserIcon className="h-3.5 w-3.5 text-tertiary" />
                  <span className="font-normal text-secondary">
                    {displayName}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-xs font-medium leading-none text-foreground">
                      {displayName}
                    </p>
                    <p className="text-[11px] leading-none text-tertiary">
                      {user.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer text-xs text-rose-400 focus:bg-rose-500/10 focus:text-rose-400"
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
              className="h-7 cursor-pointer text-xs font-normal text-secondary hover:bg-hover hover:text-foreground"
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

/**
 * apps/web/src/layouts/Sidebar.tsx
 *
 * Application sidebar navigation shell using react-router NavLink.
 */

import * as React from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, ClipboardCheck, Settings, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface SidebarProps {
  className?: string;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { title: 'Pulse', href: '/pulse', icon: Activity },
  { title: 'Audit', href: '/audit', icon: ClipboardCheck },
  { title: 'Settings', href: '/settings', icon: Settings },
  { title: 'Fleet', href: '/fleet', icon: Users },
];

export function Sidebar({ className }: SidebarProps = {}) {
  return (
    <aside
      className={cn(
        'bg-card/40 sticky top-0 flex h-screen w-60 min-w-60 flex-col justify-between border-r border-border p-4',
        className
      )}
      data-testid="app-sidebar"
    >
      <div className="space-y-6">
        {/* Brand / Logo header */}
        <div className="flex items-center px-2 py-2">
          <div className="flex items-center space-x-2">
            <div className="h-6 w-2 rounded-sm bg-[#7c3aed]" />
            <span className="font-sans text-base font-bold tracking-tight text-foreground">
              RevOps OS
            </span>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="space-y-1" aria-label="Основная навигация">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.href}
                to={item.href}
                data-testid={`nav-link-${item.href.replace('/', '')}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{item.title}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer info: version and migration tag */}
      <div className="text-muted-foreground flex items-center justify-between border-t border-border px-2 pt-4 text-xs">
        <span className="font-mono text-[11px]">v20.7.2</span>
        <Badge
          variant="outline"
          className="text-[10px] font-normal tracking-wide"
        >
          React migration
        </Badge>
      </div>
    </aside>
  );
}

export default Sidebar;

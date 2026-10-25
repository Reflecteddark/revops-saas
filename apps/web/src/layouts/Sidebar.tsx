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
        'sticky top-0 flex h-screen w-60 min-w-60 flex-col justify-between border-r border-subtle bg-background p-3',
        className
      )}
      data-testid="app-sidebar"
    >
      <div className="space-y-4">
        {/* Brand / Logo header */}
        <div className="flex items-center px-2 py-2">
          <div className="flex items-center space-x-2.5">
            <div className="h-5 w-2 rounded-sm bg-primary" />
            <span className="font-sans text-sm font-semibold tracking-tight text-foreground">
              RevOps OS
            </span>
          </div>
        </div>

        {/* Navigation items */}
        <nav className="space-y-0.5" aria-label="Основная навигация">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.href}
                to={item.href}
                data-testid={`nav-link-${item.href.replace('/', '')}`}
                className={({ isActive }) =>
                  cn(
                    'group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150 ease-out',
                    isActive
                      ? 'bg-active font-semibold text-foreground'
                      : 'text-secondary hover:bg-hover hover:text-foreground'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0 transition-colors duration-150',
                        isActive
                          ? 'text-foreground'
                          : 'text-tertiary group-hover:text-secondary'
                      )}
                    />
                    <span>{item.title}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer info: version and migration tag */}
      <div className="flex items-center justify-between border-t border-subtle px-2 pt-3 text-xs">
        <span className="font-mono text-[11px] text-tertiary">v20.7.2</span>
        <Badge
          variant="outline"
          className="border-subtle bg-hover px-1.5 py-0.5 text-[11px] font-normal tracking-wide text-tertiary"
        >
          React migration
        </Badge>
      </div>
    </aside>
  );
}

export default Sidebar;

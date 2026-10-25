/**
 * apps/web/src/layouts/AppLayout.tsx
 *
 * Primary application shell layout combining Sidebar, Header, and Outlet viewport.
 */

import * as React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useRevOpsStore } from '@/store/useRevOpsStore';

export interface AppLayoutProps {
  children?: React.ReactNode;
  className?: string;
}

export function AppLayout({ children, className }: AppLayoutProps = {}) {
  const activeTenantId = useRevOpsStore((s) => s.activeTenantId);
  useWebSocket(activeTenantId);

  return (
    <div
      className={cn(
        'flex min-h-screen bg-background text-foreground',
        className
      )}
    >
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto p-6" data-testid="layout-main">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}

export default AppLayout;

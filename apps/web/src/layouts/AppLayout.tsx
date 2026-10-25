/**
 * apps/web/src/layouts/AppLayout.tsx
 *
 * Primary application shell layout combining Sidebar, Header, and main viewport.
 */

import * as React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';

export interface AppLayoutProps {
  activeHref?: string;
  children: React.ReactNode;
  className?: string;
}

export function AppLayout({ activeHref, children, className }: AppLayoutProps) {
  return (
    <div
      className={cn(
        'flex min-h-screen bg-background text-foreground',
        className
      )}
    >
      <Sidebar activeHref={activeHref} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto p-6" data-testid="layout-main">
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppLayout;

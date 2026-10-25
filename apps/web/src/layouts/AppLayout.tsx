import * as React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { CcoChatDrawer } from '@/components/CcoChatDrawer';
import { cn } from '@/lib/utils';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useRevOpsStore } from '@/store/useRevOpsStore';

export interface AppLayoutProps {
  children?: React.ReactNode;
  className?: string;
}

export function AppLayout({ children, className }: AppLayoutProps = {}) {
  const activeTenantId = useRevOpsStore((s) => s.activeTenantId);
  const isAnalystChatOpen = useRevOpsStore((s) => s.isAnalystChatOpen);
  const setAnalystChatOpen = useRevOpsStore((s) => s.setAnalystChatOpen);
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

      {/* Global CCO / CFO AI Analyst Interactive Drawer */}
      <CcoChatDrawer
        open={isAnalystChatOpen}
        onOpenChange={setAnalystChatOpen}
      />
    </div>
  );
}

export default AppLayout;

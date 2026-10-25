/**
 * apps/web/src/layouts/AppLayout.test.tsx
 *
 * Unit tests for AppLayout, Sidebar, and Header integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './AppLayout';
import { useRevOpsStore } from '@/store/useRevOpsStore';

vi.mock('@/lib/api', () => ({
  tenantsApi: {
    list: vi.fn().mockResolvedValue([
      {
        tenant_id: 'TNT-001',
        tenant_name: 'Демо Компания',
        crm_type: 'amocrm',
        spreadsheet_id: 'sheet_1',
        status: 'active',
        niche_name: 'Недвижимость',
        avg_deal_check: 200000,
        is_template: false,
      },
    ]),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    useRevOpsStore.setState({
      activeTenantId: 'TNT-001',
      websocketStatus: 'connected',
      user: {
        id: 'usr-1',
        email: 'admin@revops.ai',
        role: 'admin',
        full_name: 'Алексей Смирнов',
        name: 'Алексей Смирнов',
        tenant_id: 'TNT-001',
        is_active: true,
      },
    });
  });

  it('renders Sidebar, Header, and children correctly', () => {
    renderWithClient(
      <AppLayout activeHref="/pulse">
        <div data-testid="test-child">Контент страницы</div>
      </AppLayout>
    );

    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(screen.getByTestId('test-child')).toBeInTheDocument();
    expect(screen.getByText('Контент страницы')).toBeInTheDocument();
  });

  it('highlights the active link according to activeHref prop', () => {
    renderWithClient(
      <AppLayout activeHref="/audit">
        <div>Пусто</div>
      </AppLayout>
    );

    const auditLink = screen.getByTestId('nav-link-audit');
    expect(auditLink).toHaveClass('bg-primary');
    expect(auditLink).toHaveClass('text-primary-foreground');

    const pulseLink = screen.getByTestId('nav-link-pulse');
    expect(pulseLink).not.toHaveClass('bg-primary');
  });

  it('displays user profile name and websocket connection status in header', () => {
    renderWithClient(
      <AppLayout activeHref="/pulse">
        <div>Содержимое</div>
      </AppLayout>
    );

    expect(screen.getByTestId('user-badge')).toHaveTextContent(
      'Алексей Смирнов'
    );
    expect(screen.getByTestId('websocket-status-dot')).toHaveClass(
      'bg-emerald-500'
    );
  });
});

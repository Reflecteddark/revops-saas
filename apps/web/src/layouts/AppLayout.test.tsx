/**
 * apps/web/src/layouts/AppLayout.test.tsx
 *
 * Unit tests for AppLayout, Sidebar (NavLink), and Header (User menu + logout) integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './AppLayout';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { authApi } from '@/lib/api';

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
  authApi: {
    logout: vi.fn().mockResolvedValue(undefined),
  },
  dealsApi: {
    sync: vi
      .fn()
      .mockResolvedValue({ success: true, deals_count: 0, total_pipeline: 0 }),
  },
  insightsApi: {
    chat: vi.fn().mockResolvedValue({ reply: 'Тестовый ответ CCO' }),
  },
}));

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

function renderWithClient(ui: React.ReactElement, initialEntry = '/pulse') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      <AppLayout>
        <div data-testid="test-child">Контент страницы</div>
      </AppLayout>
    );

    expect(screen.getByTestId('app-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(screen.getByTestId('test-child')).toBeInTheDocument();
    expect(screen.getByText('Контент страницы')).toBeInTheDocument();
  });

  it('highlights the active link according to current router location', () => {
    renderWithClient(
      <AppLayout>
        <div>Пусто</div>
      </AppLayout>,
      '/audit'
    );

    const auditLink = screen.getByTestId('nav-link-audit');
    expect(auditLink).toHaveClass('bg-active');
    expect(auditLink).toHaveClass('text-foreground');

    const pulseLink = screen.getByTestId('nav-link-pulse');
    expect(pulseLink).not.toHaveClass('bg-active');
  });

  it('shows Admin panel link for admin role, but never shows root Fleet link', () => {
    useRevOpsStore.setState({
      user: {
        id: 'adm-1',
        email: 'admin@revops.ai',
        role: 'admin',
        full_name: 'Администратор',
        tenant_id: 'TNT-001',
        is_active: true,
      },
    });

    renderWithClient(
      <AppLayout>
        <div>Контент</div>
      </AppLayout>
    );

    expect(screen.getByTestId('nav-link-pulse')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link-audit')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link-integrations')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link-settings')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link-admin')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-link-fleet')).not.toBeInTheDocument();
  });

  it('hides Admin panel link from sidebar for regular manager role', () => {
    useRevOpsStore.setState({
      user: {
        id: 'mgr-1',
        email: 'manager@company.ru',
        role: 'manager',
        full_name: 'Иван Менеджер',
        tenant_id: 'TNT-001',
        is_active: true,
      },
    });

    renderWithClient(
      <AppLayout>
        <div>Контент</div>
      </AppLayout>
    );

    expect(screen.getByTestId('nav-link-pulse')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link-audit')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link-integrations')).toBeInTheDocument();
    expect(screen.getByTestId('nav-link-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-link-admin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-link-fleet')).not.toBeInTheDocument();
  });

  it('displays user profile name and websocket connection status in header', () => {
    renderWithClient(
      <AppLayout>
        <div>Содержимое</div>
      </AppLayout>
    );

    expect(screen.getByTestId('user-menu-trigger')).toHaveTextContent(
      'Алексей Смирнов'
    );
    expect(screen.getByTestId('websocket-status-dot')).toHaveClass(
      'bg-emerald-500'
    );
  });

  it('sanitizes corrupted question mark names and displays proper clean name', () => {
    useRevOpsStore.setState({
      user: {
        id: 'usr-corrupted',
        email: 'dmitriyfedotov1908@gmail.com',
        role: 'admin',
        full_name: '??????? ???????',
        tenant_id: 'TNT-001',
        is_active: true,
      },
    });

    renderWithClient(
      <AppLayout>
        <div>Содержимое</div>
      </AppLayout>
    );

    expect(screen.getByTestId('user-menu-trigger')).toHaveTextContent(
      'dmitriyfedotov1908'
    );
    expect(screen.getByTestId('user-menu-trigger')).not.toHaveTextContent('?');
  });

  it('triggers logout and clears store on user menu logout click', async () => {
    renderWithClient(
      <AppLayout>
        <div>Содержимое</div>
      </AppLayout>
    );

    const trigger = screen.getByTestId('user-menu-trigger');
    fireEvent.keyDown(trigger, { key: 'Enter' });

    const logoutItem = await screen.findByTestId('menu-item-logout');
    fireEvent.click(logoutItem);

    await waitFor(() => {
      expect(authApi.logout).toHaveBeenCalledTimes(1);
      expect(useRevOpsStore.getState().user).toBeNull();
    });
  });

  it('opens CcoChatDrawer when open-analyst-btn is clicked', async () => {
    renderWithClient(
      <AppLayout>
        <div>Содержимое</div>
      </AppLayout>
    );

    const openBtn = screen.getByTestId('open-analyst-btn');
    expect(openBtn).toBeInTheDocument();
    fireEvent.click(openBtn);

    expect(await screen.findByTestId('cco-chat-drawer')).toBeInTheDocument();
  });
});

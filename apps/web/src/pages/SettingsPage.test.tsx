/**
 * apps/web/src/pages/SettingsPage.test.tsx
 *
 * Unit tests for SettingsPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsPage } from './SettingsPage';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { settingsApi } from '@/lib/api';
import type { Settings } from '@/types/api';

vi.mock('@/lib/api', () => ({
  settingsApi: {
    get: vi.fn(),
  },
}));

const mockSettings: Settings = {
  status: 'ok',
  source: 'test-source',
  tenant_id: 'TNT-001',
  general: {
    company_name: 'RevOps Демо',
    currency: 'RUB (₽)',
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    monthly_target: 5000000,
    project_start_date: '2026-01-01',
  },
  stages: [
    { id: 1, name: 'Квалификация', sla_hours: 24, win_pct: 35 },
    { id: 2, name: 'КП отправлено', sla_hours: 48, win_pct: 60 },
  ],
  managers: [
    { id: 'm1', name: 'Сергей Иванов', role: 'Менеджер', capacity: 25 },
  ],
  loss_reasons: [],
  telegram: {
    rop_chat_id: '12345678',
    ceo_chat_id: '87654321',
    team_chat_id: '99887766',
    dispatcher_schedule: '09:00 - 21:00 MSK',
    dispatcher_status: true,
  },
  modules: [
    {
      code: 'call_audit',
      name: 'ИИ-Аудит звонков',
      category: 'Аналитика',
      status: true,
      description: 'Автоматическая транскрипция и скоринг по 13 критериям',
    },
    {
      code: 'auto_webhook',
      name: 'Автоматические вебхуки',
      category: 'Интеграция',
      status: false,
      description: 'Отправка событий во внешние системы',
    },
  ],
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRevOpsStore.setState({ activeTenantId: 'TNT-001' });
  });

  it('renders general settings parameters', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);

    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();
    expect(screen.getByText('5 000 000 ₽')).toBeInTheDocument();
  });

  it('switches between tabs and displays stages data', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);

    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const stagesTab = screen.getByTestId('tab-stages');
    fireEvent.keyDown(stagesTab, { key: 'Enter' });

    expect(await screen.findByText('Квалификация')).toBeInTheDocument();
    expect(screen.getByText('24 ч')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
  });

  it('masks bot_token with bullets and never leaks raw token in telegram tab', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);

    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const telegramTab = screen.getByTestId('tab-telegram');
    fireEvent.keyDown(telegramTab, { key: 'Enter' });

    const tokenElement = await screen.findByTestId('bot-token-masked');
    expect(tokenElement).toHaveTextContent('••••••••');
    // Ensure "Защищено в Script Properties" or "never" is NOT in the DOM
    expect(screen.queryByText(/Защищено/i)).not.toBeInTheDocument();

    // Ensure chat IDs are masked to last 4 characters
    expect(screen.getByTestId('rop-chat-id')).toHaveTextContent('••••5678');
    expect(screen.getByTestId('ceo-chat-id')).toHaveTextContent('••••4321');
  });

  it('displays module status correctly with green badge for active and muted for inactive', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue(mockSettings);

    renderWithClient(<SettingsPage />);

    expect(await screen.findByText('RevOps Демо')).toBeInTheDocument();

    const modulesTab = screen.getByTestId('tab-modules');
    fireEvent.keyDown(modulesTab, { key: 'Enter' });

    expect(await screen.findByText('ИИ-Аудит звонков')).toBeInTheDocument();

    const activeModuleBadge = screen.getByTestId('module-status-call_audit');
    expect(activeModuleBadge).toHaveTextContent('Активен');
    expect(activeModuleBadge).toHaveClass('text-emerald-500');

    const inactiveModuleBadge = screen.getByTestId('module-status-auto_webhook');
    expect(inactiveModuleBadge).toHaveTextContent('Отключен');
    expect(inactiveModuleBadge).toHaveClass('text-muted-foreground');
  });
});

/**
 * apps/web/src/pages/IntegrationsPage.test.tsx
 *
 * Unit tests for IntegrationsPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntegrationsPage } from './IntegrationsPage';
import { integrationsApi } from '@/lib/api';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import type { IntegrationsHealthResponse } from '@/types/api';

vi.mock('@/lib/api', () => ({
  integrationsApi: {
    getHealth: vi.fn(),
    retryDlq: vi.fn(),
    sendTelegramReport: vi.fn(),
  },
}));

const mockHealthData: IntegrationsHealthResponse = {
  status: 'healthy',
  timestamp: '2026-10-26T08:50:00Z',
  tenant_id: 'TNT-001',
  services: {
    redis_queue: {
      status: 'healthy',
      queue_length: 0,
      label: 'Очередь Ingress-звонков',
    },
    postgres_dwh: {
      status: 'healthy',
      calls_count: 36,
      deals_count: 41,
      label: 'Хранилище DWH (PostgreSQL 16)',
    },
    google_sheets_syncer: {
      status: 'healthy',
      synced_count: 32,
      pending_count: 4,
      label: 'Пакетная синхронизация',
    },
    dead_letter_queue: {
      status: 'action_required',
      active_failures: 2,
      total_failures: 4,
      label: 'Изолятор сбоев (DLQ)',
    },
  },
  reconciliation: {
    dwh_total_calls: 36,
    sheets_synced_calls: 32,
    pending_queue_calls: 4,
    dwh_total_deals: 41,
    dlq_failures: 2,
    is_balanced: true,
    balance_percentage: 88.9,
  },
  dlq_items: [
    {
      id: 'dlq-1',
      crm_source: 'amocrm',
      external_call_id: 'call_amo_123',
      audio_url: 'https://storage/amo123.mp3',
      error_message: 'Timeout connecting to CRM API',
      retry_count: 1,
      created_at: '2026-10-26 08:30:00',
      is_resolved: false,
    },
    {
      id: 'dlq-2',
      crm_source: 'bitrix24',
      external_call_id: 'call_b24_456',
      audio_url: 'https://storage/b24_456.mp3',
      error_message: 'Invalid deal format',
      retry_count: 0,
      created_at: '2026-10-26 08:35:00',
      is_resolved: false,
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
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('IntegrationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRevOpsStore.setState({ activeTenantId: 'TNT-001' });
  });

  it('renders header, 4 KPI cards, and lineage bar when data is loaded', async () => {
    vi.mocked(integrationsApi.getHealth).mockResolvedValue(mockHealthData);

    renderWithClient(<IntegrationsPage />);

    expect(await screen.findByTestId('card-redis')).toBeInTheDocument();
    expect(
      screen.getByText('Здоровье интеграций & Баланс данных')
    ).toBeInTheDocument();
    expect(screen.getByTestId('card-dwh')).toBeInTheDocument();
    expect(screen.getByTestId('card-sheets')).toBeInTheDocument();
    expect(screen.getByTestId('card-dlq')).toBeInTheDocument();
    expect(screen.getByTestId('reconciliation-funnel-bar')).toBeInTheDocument();
  });

  it('renders DLQ table with failed call items', async () => {
    vi.mocked(integrationsApi.getHealth).mockResolvedValue(mockHealthData);

    renderWithClient(<IntegrationsPage />);

    expect(await screen.findByText('call_amo_123')).toBeInTheDocument();
    expect(screen.getByText('call_b24_456')).toBeInTheDocument();
    expect(
      screen.getByText('Timeout connecting to CRM API')
    ).toBeInTheDocument();
  });

  it('triggers 1-click DLQ retry on all calls', async () => {
    vi.mocked(integrationsApi.getHealth).mockResolvedValue(mockHealthData);
    vi.mocked(integrationsApi.retryDlq).mockResolvedValue({
      status: 'success',
      re_enqueued_count: 2,
      message: 'Успешно отправлено на повторный аудит: 2 звонков',
    });

    renderWithClient(<IntegrationsPage />);

    await screen.findByTestId('card-redis');
    const retryAllBtn = screen.getByTestId('btn-retry-all-dlq');
    expect(retryAllBtn).not.toBeDisabled();
    fireEvent.click(retryAllBtn);

    await waitFor(() => {
      expect(integrationsApi.retryDlq).toHaveBeenCalledWith('TNT-001');
    });
  });

  it('triggers Telegram morning report dispatch on button click', async () => {
    vi.mocked(integrationsApi.getHealth).mockResolvedValue(mockHealthData);
    vi.mocked(integrationsApi.sendTelegramReport).mockResolvedValue({
      status: 'sent',
      chat_id: '1422365475',
      timestamp: '26.10.2026 08:48',
    });

    renderWithClient(<IntegrationsPage />);

    await screen.findByTestId('card-redis');
    const sendTgBtn = screen.getByTestId('btn-send-tg');
    fireEvent.click(sendTgBtn);

    await waitFor(() => {
      expect(integrationsApi.sendTelegramReport).toHaveBeenCalledWith(
        'TNT-001'
      );
    });
  });

  it('renders empty clean state when DLQ has 0 failures', async () => {
    const cleanData: IntegrationsHealthResponse = {
      ...mockHealthData,
      reconciliation: {
        ...mockHealthData.reconciliation,
        dlq_failures: 0,
      },
      dlq_items: [],
    };
    vi.mocked(integrationsApi.getHealth).mockResolvedValue(cleanData);

    renderWithClient(<IntegrationsPage />);

    expect(await screen.findByTestId('dlq-empty-state')).toBeInTheDocument();
    expect(
      screen.getByText('Очередь Dead Letter Queue чиста')
    ).toBeInTheDocument();
  });
});

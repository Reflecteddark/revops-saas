/**
 * apps/web/src/pages/PulsePage.test.tsx
 *
 * Unit tests for PulsePage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PulsePage } from './PulsePage';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { callsApi, insightsApi } from '@/lib/api';
import type { Call, InsightsSummaryResponse } from '@/types/api';

vi.mock('@/lib/api', () => ({
  insightsApi: {
    summary: vi.fn(),
  },
  callsApi: {
    list: vi.fn(),
  },
}));

const mockInsights: InsightsSummaryResponse = {
  status: 'ok',
  engine: 'test-engine',
  tenant_id: 'TNT-001',
  p10_corridor_rub: 2000000,
  p50_corridor_rub: 3500000,
  p90_corridor_rub: 4800000,
  confidence_score: 0.92,
  calculation_method: 'linear_scenario',
  recommendations: [
    {
      title: 'Ускорить квалификацию',
      impact_rub: 450000,
      description: 'Фокусироваться на лицах принимающих решения на первом этапе.',
    },
  ],
  insights: [],
  synthesis: 'Позитивный тренд по выручке.',
  executive_summary: 'План P50 достижим при текущей динамике.',
  leak_breakdown: {
    stalled_deals: { count: 3, amount_rub: 250000 },
  },
  total_leak_rub: 250000,
};

const mockCalls: Call[] = [
  {
    id: 'call-1',
    deal_id: 'deal-101',
    deal_title: 'Сделка АгроХим',
    client: 'ООО АгроХим',
    manager: 'Иван Петров',
    stage: 'Квалификация',
    duration: '04:12',
    amount: '500 000 ₽',
    amount_num: 500000,
    score: 11,
    status: 'won',
    status_label: 'Успешно',
    risk_amount: '0 ₽',
    next_step: 1,
    date: '2026-10-24 14:30',
    cr: [],
    error_summary: '',
    recommendation: 'Отличный контакт',
    transcript: '— Здравствуйте!\n— Добрый день, мы готовы подписать договор.',
  },
];

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

describe('PulsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRevOpsStore.setState({ activeTenantId: 'TNT-001' });
  });

  it('renders empty tenant state when activeTenantId is null', () => {
    useRevOpsStore.setState({ activeTenantId: null });

    renderWithClient(<PulsePage />);

    expect(screen.getByTestId('empty-tenant-state')).toBeInTheDocument();
    expect(screen.getByText('Тенант не выбран')).toBeInTheDocument();
  });

  it('renders 4 KpiCards with correct values when data is loaded', async () => {
    vi.mocked(insightsApi.summary).mockResolvedValue(mockInsights);
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);

    renderWithClient(<PulsePage />);

    // Wait for async queries to resolve
    expect(await screen.findByText('Ускорить квалификацию')).toBeInTheDocument();

    expect(screen.getByText('Выручка')).toBeInTheDocument();
    expect(screen.getByText('Звонков')).toBeInTheDocument();
    expect(screen.getByText('SLA риск')).toBeInTheDocument();
    expect(screen.getByText('Конверсия')).toBeInTheDocument();

    // Verify calls table
    expect(screen.getByText('ООО АгроХим')).toBeInTheDocument();
    expect(screen.getByText('11/13')).toBeInTheDocument();
  });

  it('shows skeleton cards during initial loading', () => {
    vi.mocked(insightsApi.summary).mockReturnValue(new Promise(() => {}));
    vi.mocked(callsApi.list).mockReturnValue(new Promise(() => {}));

    renderWithClient(<PulsePage />);

    const skeletons = screen.getAllByTestId('kpi-skeleton');
    expect(skeletons.length).toBe(4);
    expect(screen.getByTestId('recommendations-loading')).toBeInTheDocument();
  });

  it('renders error alert with retry button when query fails', async () => {
    vi.mocked(insightsApi.summary).mockRejectedValue(new Error('Network error'));
    vi.mocked(callsApi.list).mockResolvedValue([]);

    renderWithClient(<PulsePage />);

    await waitFor(() => {
      expect(screen.getByTestId('pulse-error')).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /повторить/i });
    expect(retryBtn).toBeInTheDocument();

    vi.mocked(insightsApi.summary).mockResolvedValueOnce(mockInsights);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(insightsApi.summary).toHaveBeenCalledTimes(2);
    });
  });

  it('opens transcript dialog when a call row is clicked', async () => {
    vi.mocked(insightsApi.summary).mockResolvedValue(mockInsights);
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);

    renderWithClient(<PulsePage />);

    const clientCell = await screen.findByText('ООО АгроХим');
    fireEvent.click(clientCell);

    await waitFor(() => {
      expect(screen.getByTestId('call-transcript')).toBeInTheDocument();
    });

    expect(screen.getByText(/мы готовы подписать договор/i)).toBeInTheDocument();
  });
});

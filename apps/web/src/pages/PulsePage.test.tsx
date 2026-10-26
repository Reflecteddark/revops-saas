/**
 * apps/web/src/pages/PulsePage.test.tsx
 *
 * Unit tests for PulsePage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRevOpsStore } from '@/store/useRevOpsStore';
import { PulsePage } from './PulsePage';
import { callsApi, dealsApi, insightsApi, settingsApi } from '@/lib/api';
import type { Call, InsightsSummaryResponse } from '@/types/api';

vi.mock('@/lib/api', () => ({
  insightsApi: {
    summary: vi.fn(),
  },
  callsApi: {
    list: vi.fn(),
  },
  dealsApi: {
    list: vi.fn(),
  },
  settingsApi: {
    get: vi.fn(),
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
      description:
        'Фокусироваться на лицах принимающих решения на первом этапе.',
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
    cr: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
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
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('PulsePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRevOpsStore.setState({ activeTenantId: 'TNT-001' });
    vi.mocked(dealsApi.list).mockResolvedValue([]);
    vi.mocked(settingsApi.get).mockResolvedValue({
      status: 'ok',
      source: 'test',
      tenant_id: 'TNT-001',
      general: {
        company_name: 'RevOps Демо',
        currency: 'RUB (₽)',
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        monthly_target: 5000000,
        project_start_date: '2026-10-01',
      },
      stages: [],
      managers: [],
      loss_reasons: [],
      telegram: {
        rop_chat_id: '',
        ceo_chat_id: '',
        team_chat_id: '',
        dispatcher_schedule: '',
        dispatcher_status: true,
      },
      modules: [],
    });
  });

  it('renders empty tenant state when activeTenantId is null', () => {
    useRevOpsStore.setState({ activeTenantId: null });

    renderWithClient(<PulsePage />);

    expect(screen.getByTestId('empty-tenant-state')).toBeInTheDocument();
    expect(screen.getByText('Тенант не выбран')).toBeInTheDocument();
  });

  it('renders 5 KpiCards and widgets with correct values when data is loaded', async () => {
    vi.mocked(insightsApi.summary).mockResolvedValue(mockInsights);
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);
    vi.mocked(dealsApi.list).mockResolvedValue([]);

    renderWithClient(<PulsePage />);

    // Wait for async queries to resolve
    expect(
      await screen.findByText('Ускорить квалификацию')
    ).toBeInTheDocument();

    expect(screen.getAllByText('Выручка факт').length).toBeGreaterThanOrEqual(
      1
    );
    expect(screen.getByText('Пайплайн')).toBeInTheDocument();
    expect(screen.getByText('Качество звонков')).toBeInTheDocument();
    expect(screen.getByText('Дефицит до плана')).toBeInTheDocument();
    expect(screen.getByText('SLA риск')).toBeInTheDocument();

    // Verify calls table
    expect(screen.getByText('ООО АгроХим')).toBeInTheDocument();
    expect(screen.getByTestId('call-score')).toHaveTextContent('11/13');

    // Verify widgets
    expect(screen.getByTestId('lost-deals-banner')).toBeInTheDocument();
    expect(screen.getByTestId('pipeline-funnel')).toBeInTheDocument();
    expect(screen.getByTestId('monte-carlo-corridor')).toBeInTheDocument();
    expect(
      screen.getByTestId('express-scenario-calculator')
    ).toBeInTheDocument();
    expect(screen.getByTestId('ai-impact-card')).toBeInTheDocument();
    expect(screen.getByTestId('daily-pulse-matrix')).toBeInTheDocument();
    expect(screen.getByTestId('business-economics-card')).toBeInTheDocument();
    expect(screen.getByTestId('pulse-smart-alert')).toBeInTheDocument();
    expect(screen.getAllByTestId('status-segmented-bar')).toHaveLength(2);
  });

  it('shows skeleton cards during initial loading', () => {
    vi.mocked(insightsApi.summary).mockReturnValue(new Promise(() => {}));
    vi.mocked(callsApi.list).mockReturnValue(new Promise(() => {}));
    vi.mocked(dealsApi.list).mockReturnValue(new Promise(() => {}));

    renderWithClient(<PulsePage />);

    const skeletons = screen.getAllByTestId('kpi-skeleton');
    expect(skeletons.length).toBe(5);
    expect(screen.getByTestId('recommendations-loading')).toBeInTheDocument();
  });

  it('renders error alert with retry button when query fails', async () => {
    vi.mocked(insightsApi.summary).mockRejectedValue(
      new Error('Network error')
    );
    vi.mocked(callsApi.list).mockResolvedValue([]);
    vi.mocked(dealsApi.list).mockResolvedValue([]);

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

  it('opens transcript drawer when a call row is clicked', async () => {
    vi.mocked(insightsApi.summary).mockResolvedValue(mockInsights);
    vi.mocked(callsApi.list).mockResolvedValue(mockCalls);
    vi.mocked(dealsApi.list).mockResolvedValue([]);

    renderWithClient(<PulsePage />);

    const clientCell = await screen.findByText('ООО АгроХим');
    fireEvent.click(clientCell);

    await waitFor(() => {
      expect(screen.getByTestId('call-transcript')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/мы готовы подписать договор/i)
    ).toBeInTheDocument();
  });

  it('renders dynamic sales plan from settingsApi and computes deficit label correctly', async () => {
    vi.mocked(settingsApi.get).mockResolvedValue({
      status: 'ok',
      source: 'test',
      tenant_id: 'TNT-001',
      general: {
        company_name: 'ООО Прогресс',
        currency: 'RUB (₽)',
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        monthly_target: 8000000,
        project_start_date: '2026-10-01',
      },
      stages: [],
      managers: [],
      loss_reasons: [],
      telegram: {
        rop_chat_id: '',
        ceo_chat_id: '',
        team_chat_id: '',
        dispatcher_schedule: '',
        dispatcher_status: true,
      },
      modules: [],
    });
    vi.mocked(insightsApi.summary).mockResolvedValue(mockInsights);
    vi.mocked(callsApi.list).mockResolvedValue([]);
    vi.mocked(dealsApi.list).mockResolvedValue([]);

    renderWithClient(<PulsePage />);

    // Should display plan 8.0M in trend label
    expect(await screen.findByText(/план 8\.0M ₽/i)).toBeInTheDocument();
  });
});

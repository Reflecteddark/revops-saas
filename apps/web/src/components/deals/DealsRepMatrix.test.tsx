/**
 * apps/web/src/components/deals/DealsRepMatrix.test.tsx
 *
 * Unit tests for DealsRepMatrix:
 * - Loading and empty states
 * - Leader Benchmark Card rendering
 * - Team benchmarks strip
 * - Manager heatmap rows and filter callback triggering
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DealsRepMatrix } from './DealsRepMatrix';
import { dealsApi } from '@/lib/api';
import type { RepsPerformanceResponse } from '@/types/api';

vi.mock('@/lib/api', () => ({
  dealsApi: {
    repPerformance: vi.fn(),
  },
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

const mockResponse: RepsPerformanceResponse = {
  status: 'ok',
  tenant_id: 'TNT-001',
  pipeline_id: null,
  total_reps: 2,
  team_benchmarks: {
    total_won_amount: 1200000,
    avg_deal_amount: 300000,
    win_rate_pct: 66.7,
    cycle_days_median: 14.5,
    speech_score_avg: 10.2,
  },
  benchmark_leader: {
    name: 'Алексей Смирнов',
    won_amount: 900000,
    won_count: 3,
    avg_deal_amount: 300000,
    win_rate_pct: 75.0,
    cycle_days_median: 12.0,
    speech_score_avg: 11.5,
    aov_delta_pct: 20,
    win_rate_delta: 8.3,
    drivers: [
      'Средний чек выше нормы отдела (+20%)',
      'Высокая конверсия дожима (75% vs 66.7% по отделу)',
    ],
    summary: 'Алексей Смирнов лидирует в пайплайне с выручкой 900 000 ₽.',
  },
  reps: [
    {
      manager_name: 'Алексей Смирнов',
      won_amount: 900000,
      won_count: 3,
      lost_count: 1,
      active_count: 4,
      total_deals: 8,
      avg_deal_amount: 300000,
      win_rate_pct: 75.0,
      gross_conversion_pct: 37.5,
      cycle_days_median: 12.0,
      sla_risk_amount: 0,
      calls_count: 24,
      speech_score_avg: 11.5,
      next_step_pct: 88.0,
      sample_size_ok: true,
      success_driver: 'Высокая дожимаемость (Win Rate)',
      weak_spot: '',
    },
    {
      manager_name: 'Ольга Кузнецова',
      won_amount: 300000,
      won_count: 1,
      lost_count: 1,
      active_count: 3,
      total_deals: 5,
      avg_deal_amount: 300000,
      win_rate_pct: 50.0,
      gross_conversion_pct: 20.0,
      cycle_days_median: 18.0,
      sla_risk_amount: 150000,
      calls_count: 10,
      speech_score_avg: 8.5,
      next_step_pct: 60.0,
      sample_size_ok: true,
      success_driver: 'Стабильная работа по скрипту',
      weak_spot: 'Зависание сделок в SLA (150 000 ₽)',
    },
  ],
};

describe('DealsRepMatrix Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton when fetching', () => {
    vi.mocked(dealsApi.repPerformance).mockReturnValue(new Promise(() => {}));
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <DealsRepMatrix tenantId="TNT-001" />
      </QueryClientProvider>
    );

    expect(screen.getByTestId('rep-matrix-loading')).toBeInTheDocument();
  });

  it('renders empty state when no reps exist', async () => {
    vi.mocked(dealsApi.repPerformance).mockResolvedValue({
      status: 'ok',
      tenant_id: 'TNT-001',
      pipeline_id: null,
      total_reps: 0,
      reps: [],
      team_benchmarks: {
        total_won_amount: 0,
        avg_deal_amount: 0,
        win_rate_pct: 0,
        cycle_days_median: null,
        speech_score_avg: null,
      },
      benchmark_leader: null,
    });
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <DealsRepMatrix tenantId="TNT-001" />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('rep-matrix-empty')).toBeInTheDocument();
    });
  });

  it('renders leader card, team benchmarks and heatmap table', async () => {
    vi.mocked(dealsApi.repPerformance).mockResolvedValue(mockResponse);
    const onSelectManager = vi.fn();
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <DealsRepMatrix
          tenantId="TNT-001"
          pipelineId="pipe-1"
          onSelectManager={onSelectManager}
        />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('rep-performance-matrix')).toBeInTheDocument();
    });

    // Verify Leader Card
    expect(screen.getByText('Лидер продаж воронки')).toBeInTheDocument();
    expect(screen.getAllByText('Алексей Смирнов').length).toBeGreaterThan(0);
    expect(screen.getByText('Средний чек выше нормы отдела (+20%)')).toBeInTheDocument();

    // Verify Team Benchmarks
    expect(screen.getByText('Общая касса отдела')).toBeInTheDocument();
    expect(screen.getByText('1 200 000 ₽')).toBeInTheDocument();

    // Verify Reps Table
    expect(screen.getByText('Ольга Кузнецова')).toBeInTheDocument();
    expect(screen.getByText('Зависание сделок в SLA (150 000 ₽)')).toBeInTheDocument();

    // Verify interaction
    const leaderActionBtn = screen.getByText('Смотреть сделки лидера');
    fireEvent.click(leaderActionBtn);
    expect(onSelectManager).toHaveBeenCalledWith('Алексей Смирнов');
  });

  it('shows no leader and no win rate while nothing is closed', async () => {
    vi.mocked(dealsApi.repPerformance).mockResolvedValue({
      ...mockResponse,
      benchmark_leader: mockResponse.benchmark_leader
        ? { ...mockResponse.benchmark_leader, won_count: 0, won_amount: 0 }
        : mockResponse.benchmark_leader,
      team_benchmarks: { ...mockResponse.team_benchmarks, win_rate_pct: 0 },
      reps: mockResponse.reps.map((r) => ({ ...r, won_count: 0, lost_count: 0, won_amount: 0, win_rate_pct: 0 })),
    });
    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <DealsRepMatrix tenantId="TNT-001" pipelineId="pipe-1" />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('rep-performance-matrix')).toBeInTheDocument();
    });
    expect(screen.queryByText('Лидер продаж воронки')).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    // no raw LaTeX in the heading
    expect(document.body.textContent).not.toContain('$');
  });
});

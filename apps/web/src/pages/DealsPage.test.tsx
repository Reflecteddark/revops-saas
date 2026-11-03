/**
 * apps/web/src/pages/DealsPage.test.tsx
 *
 * Tests for DealsPage: multi-pipeline switcher, Kanban columns, table view and filters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';
import { DealsPage } from './DealsPage';
import { dealsApi } from '@/lib/api';
import { DEALS_CHANGED_EVENT } from '@/hooks/useWebSocket';
import type { Deal, Pipeline } from '@/types/api';

vi.mock('@/lib/api', () => ({
  dealsApi: {
    pipelines: vi.fn(),
    list: vi.fn(),
    sync: vi.fn(),
    get: vi.fn(),
    repPerformance: vi.fn(),
    fixNextStep: vi.fn(),
  },
}));

vi.mock('@/store/useRevOpsStore', () => ({
  useRevOpsStore: (selector: any) =>
    selector({
      activeTenantId: 'TNT-002',
    }),
}));

const mockPipelines: Pipeline[] = [
  {
    id: 'pipe-main',
    name: 'Новые продажи',
    is_main: true,
    deal_count: 2,
    total_amount: 1500000,
    stages: [
      { id: '1', name: 'Первичный контакт', color: '#39A8EF' },
      { id: '2', name: 'Квалификация', color: '#2FC6F6' },
      { id: '6', name: 'Успешно реализовано', color: '#7BD500', is_won: true },
      { id: '7', name: 'Закрыто и не реализовано', color: '#FF5752', is_lost: true },
    ],
  },
  {
    id: 'pipe-vip',
    name: 'VIP Клиенты',
    is_main: false,
    deal_count: 1,
    total_amount: 5000000,
    stages: [
      { id: 'vip-1', name: 'Переговоры', color: '#FFA900' },
      { id: 'vip-2', name: 'Оплата VIP', color: '#7BD500', is_won: true },
    ],
  },
];

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockDeals: Deal[] = [
  {
    id: 'AMO-4870417',
    deal_id: '4870417',
    org_id: 'TNT-002',
    crm_deal_id: 'AMO-4870417',
    crm_source: 'amocrm',
    title: 'АО ТехноПром',
    amount: 1000000,
    amount_str: '1 000 000 ₽',
    pipeline_id: 'pipe-main',
    pipeline_name: 'Новые продажи',
    stage_id: '1',
    stage: 'Первичный контакт',
    stage_name: 'Первичный контакт',
    status: 'active',
    sla_risk: true,
    responsible_user: 'Дмитрий Федотов',
    segment: 'General B2B',
    calls_count: 2,
    avg_call_score: 85,
    created_at: '2026-10-25T10:00:00Z',
    updated_at: '2026-10-25T12:00:00Z',
    synced_at: '2026-10-25T12:00:00Z',
  },
  {
    id: 'AMO-4949955',
    deal_id: '4949955',
    org_id: 'TNT-002',
    crm_deal_id: 'AMO-4949955',
    crm_source: 'amocrm',
    title: 'ООО Вектор Развития',
    amount: 500000,
    amount_str: '500 000 ₽',
    pipeline_id: 'pipe-main',
    pipeline_name: 'Новые продажи',
    stage_id: '7',
    stage: 'Закрыто и не реализовано',
    stage_name: 'Закрыто и не реализовано',
    status: 'lost',
    loss_reason: 'Слишком дорого',
    loss_reason_code: 'price_too_high',
    sla_risk: false,
    responsible_user: 'Иван Менеджер',
    segment: 'General B2B',
    calls_count: 1,
    avg_call_score: 55,
    created_at: '2026-10-24T10:00:00Z',
    updated_at: '2026-10-24T12:00:00Z',
    synced_at: '2026-10-24T12:00:00Z',
  },
];

describe('DealsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (dealsApi.pipelines as any).mockResolvedValue(mockPipelines);
    (dealsApi.list as any).mockResolvedValue(mockDeals);
    (dealsApi.get as any).mockResolvedValue({
      ...mockDeals[0],
      calls: [
        {
          id: 'call-1',
          client_phone: '+7 (999) 000-00-00',
          duration_seconds: 120,
          duration_str: '2:00',
          status: 'completed',
          overall_score: 85,
          scorecard_criteria: { cr1: 1, cr2: 1, cr3: 0 },
          transcript_text: 'Здравствуйте! Мы по поводу аудита...',
          ai_summary: 'Клиент готов на аудит.',
          next_action_extracted: 'Отправить КП на почту',
        },
      ],
    });
  });

  it('renders page header, pipeline switcher and aggregate stats', async () => {
    renderWithQuery(<DealsPage />);

    expect(screen.getByText('Сделки и Воронка продаж')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/Новые продажи/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Всего сделок')).toBeInTheDocument();
      // pipeline = OPEN deals only: the 500 000 lost deal is not part of it (1 000 000, not 1 500 000)
      expect(screen.getAllByText(/1 000 000 ₽/).length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText(/1 500 000 ₽/)).not.toBeInTheDocument();
    });
  });

  it('renders Kanban board with stages and deal cards', async () => {
    renderWithQuery(<DealsPage />);

    await waitFor(() => {
      expect(screen.getByText('Первичный контакт')).toBeInTheDocument();
      expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
      expect(screen.getByText('ООО Вектор Развития')).toBeInTheDocument();
      expect(screen.getAllByText('Слишком дорого').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('switches between Kanban and Table views', async () => {
    renderWithQuery(<DealsPage />);

    await waitFor(() => {
      expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
    });

    const tableToggle = screen.getByRole('button', { name: /таблица/i });
    fireEvent.click(tableToggle);

    await waitFor(() => {
      expect(screen.getByText('Сделка / Клиент')).toBeInTheDocument();
      expect(screen.getByText('Дмитрий Федотов')).toBeInTheDocument();
    });
  });

  it('filters by SLA risk', async () => {
    renderWithQuery(<DealsPage />);

    await waitFor(() => {
      expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
    });

    const slaCheckbox = screen.getByRole('checkbox');
    fireEvent.click(slaCheckbox);

    // Only SLA deal should remain
    expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
    expect(screen.queryByText('ООО Вектор Развития')).not.toBeInTheDocument();
  });

  it('opens deal slide-over drawer when a deal card is clicked', async () => {
    renderWithQuery(<DealsPage />);

    await waitFor(() => {
      expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('АО ТехноПром'));

    await waitFor(() => {
      expect(screen.getByTestId('deal-details-drawer')).toBeInTheDocument();
      expect(screen.getByText('Бюджет сделки')).toBeInTheDocument();
    });
  });

  it('renders manager filter chips and filters deals when manager chip clicked', async () => {
    renderWithQuery(<DealsPage />);

    await waitFor(() => {
      expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
      expect(screen.getByText('ООО Вектор Развития')).toBeInTheDocument();
    });

    // Check manager chips exist and click on Dmitry Fedotov chip
    const dmitryChip = screen.getByRole('button', { name: /Дмитрий Федотов/i });
    expect(dmitryChip).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Иван Менеджер/i })).toBeInTheDocument();

    fireEvent.click(dmitryChip);

    // Deals should be filtered to only Dmitry's deal
    expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
    expect(screen.queryByText('ООО Вектор Развития')).not.toBeInTheDocument();

    // Click on "Все" chip
    const allChip = screen.getByRole('button', { name: /^все \(/i });
    fireEvent.click(allChip);

    // Both deals should return
    expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
    expect(screen.getByText('ООО Вектор Развития')).toBeInTheDocument();
  });

  it('switches to Reps DNA Matrix view when tab clicked', async () => {
    (dealsApi.repPerformance as any).mockResolvedValue({
      status: 'ok',
      tenant_id: 'TNT-002',
      pipeline_id: null,
      total_reps: 1,
      team_benchmarks: {
        total_won_amount: 1000000,
        avg_deal_amount: 500000,
        win_rate_pct: 50.0,
        cycle_days_median: 10.0,
        speech_score_avg: 9.0,
      },
      benchmark_leader: {
        name: 'Дмитрий Федотов',
        won_amount: 1000000,
        won_count: 2,
        avg_deal_amount: 500000,
        win_rate_pct: 100.0,
        cycle_days_median: 10.0,
        speech_score_avg: 9.5,
        aov_delta_pct: 0,
        win_rate_delta: 50.0,
        drivers: ['Высокая конверсия дожима'],
        summary: 'Дмитрий Федотов лидирует в пайплайне.',
      },
      reps: [
        {
          manager_name: 'Дмитрий Федотов',
          won_amount: 1000000,
          won_count: 2,
          lost_count: 0,
          active_count: 1,
          total_deals: 3,
          avg_deal_amount: 500000,
          win_rate_pct: 100.0,
          gross_conversion_pct: 66.7,
          cycle_days_median: 10.0,
          sla_risk_amount: 0,
          calls_count: 5,
          speech_score_avg: 9.5,
          next_step_pct: 80.0,
          sample_size_ok: true,
          success_driver: 'Высокая дожимаемость (Win Rate)',
          weak_spot: '',
        },
      ],
    });

    renderWithQuery(<DealsPage />);

    await waitFor(() => {
      expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
    });

    // Switch to reps tab
    const repsTab = screen.getByRole('button', { name: /менеджеры \(днк\)/i });
    fireEvent.click(repsTab);

    await waitFor(() => {
      expect(screen.getByTestId('rep-performance-matrix')).toBeInTheDocument();
      expect(screen.getByText('Лидер продаж воронки')).toBeInTheDocument();
    });
  });

  it('radar: "Назначить шаг" stores the next step on the server and reloads the deals', async () => {
    vi.mocked(dealsApi.fixNextStep).mockResolvedValue({ status: 'success', persisted: true, message: 'ok', deal: {} });

    renderWithQuery(<DealsPage />);
    await waitFor(() => {
      expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
    });
    const callsBefore = vi.mocked(dealsApi.list).mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /радар рисков/i }));
    const fixBtn = await screen.findByTestId('fix-next-step-AMO-4870417');
    fireEvent.click(fixBtn);

    await waitFor(() => {
      expect(dealsApi.fixNextStep).toHaveBeenCalledTimes(1);
    });
    const [dealId, date, tenant] = vi.mocked(dealsApi.fixNextStep).mock.calls[0];
    expect(dealId).toBe('AMO-4870417');
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tenant).toBe('TNT-002');
    await waitFor(() => {
      expect(vi.mocked(dealsApi.list).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('reloads the deals when the server announces a change (WebSocket deal_updated)', async () => {
    renderWithQuery(<DealsPage />);
    await waitFor(() => {
      expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
    });
    const callsBefore = vi.mocked(dealsApi.list).mock.calls.length;

    window.dispatchEvent(new CustomEvent(DEALS_CHANGED_EVENT));

    await waitFor(() => {
      expect(vi.mocked(dealsApi.list).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

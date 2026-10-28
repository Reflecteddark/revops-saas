/**
 * apps/web/src/pages/DealsPage.test.tsx
 *
 * Tests for DealsPage: multi-pipeline switcher, Kanban columns, table view and filters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DealsPage } from './DealsPage';
import { dealsApi } from '@/lib/api';
import type { Deal, Pipeline } from '@/types/api';

vi.mock('@/lib/api', () => ({
  dealsApi: {
    pipelines: vi.fn(),
    list: vi.fn(),
    sync: vi.fn(),
    get: vi.fn(),
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
    render(<DealsPage />);

    expect(screen.getByText('Сделки и Воронка продаж')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/Новые продажи/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Всего сделок')).toBeInTheDocument();
      expect(screen.getAllByText(/1 500 000 ₽/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders Kanban board with stages and deal cards', async () => {
    render(<DealsPage />);

    await waitFor(() => {
      expect(screen.getByText('Первичный контакт')).toBeInTheDocument();
      expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
      expect(screen.getByText('ООО Вектор Развития')).toBeInTheDocument();
      expect(screen.getAllByText('Слишком дорого').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('switches between Kanban and Table views', async () => {
    render(<DealsPage />);

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
    render(<DealsPage />);

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
    render(<DealsPage />);

    await waitFor(() => {
      expect(screen.getByText('АО ТехноПром')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('АО ТехноПром'));

    await waitFor(() => {
      expect(screen.getByTestId('deal-details-drawer')).toBeInTheDocument();
      expect(screen.getByText('Бюджет сделки')).toBeInTheDocument();
    });
  });
});

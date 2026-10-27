/**
 * apps/web/src/components/rnp/RnpStandupView.test.tsx
 *
 * Unit tests for RnpStandupView component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RnpStandupView } from './RnpStandupView';
import type { Call, Deal, ManagerConfig } from '@/types/api';

const mockCalls: Call[] = [
  {
    id: 'c1',
    deal_id: 'd1',
    deal_title: 'Сделка 1',
    client: 'Клиент А',
    manager: 'Иван Петров',
    stage: 'КП',
    duration: '03:15',
    duration_seconds: 195,
    amount: '100 000 ₽',
    amount_num: 100000,
    score: 11,
    status: 'won',
    status_label: 'ЭТАЛОН',
    risk_amount: '0',
    next_step: 1,
    zoom_scheduled: true,
    date: '2026-10-26',
    cr: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    error_summary: '',
    recommendation: '',
    transcript: 'Тест',
  },
  {
    id: 'c2',
    deal_id: 'd2',
    deal_title: 'Сделка 2',
    client: 'Клиент Б',
    manager: 'Ольга Сидорова',
    stage: 'Квалификация',
    duration: '00:45',
    duration_seconds: 45,
    amount: '50 000 ₽',
    amount_num: 50000,
    score: 4,
    status: 'risk',
    status_label: 'СЛИВ',
    risk_amount: '50 000 ₽',
    next_step: 0,
    zoom_scheduled: false,
    date: '2026-10-26',
    cr: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    error_summary: 'Нет цели',
    recommendation: 'Отработать возражения',
    transcript: 'Тест',
  },
];

const mockDeals: Deal[] = [
  {
    id: 'd1',
    deal_id: 'd1',
    org_id: 'org1',
    crm_deal_id: '101',
    crm_source: 'amoCRM',
    title: 'Крупная поставка',
    amount: 500000,
    amount_str: '500 000 ₽',
    stage_id: 's1',
    stage: 'Согласование договора',
    status: 'active',
    sla_risk: true,
    responsible_user: 'Иван Петров',
    segment: 'B2B',
    created_at: '2026-10-20',
    updated_at: '2026-10-20',
    synced_at: '2026-10-26',
  },
  {
    id: 'd2',
    deal_id: 'd2',
    org_id: 'org1',
    crm_deal_id: '102',
    crm_source: 'Bitrix24',
    title: 'Успешный контракт',
    amount: 300000,
    amount_str: '300 000 ₽',
    stage_id: 's2',
    stage: 'Оплачено',
    status: 'won',
    sla_risk: false,
    responsible_user: 'Ольга Сидорова',
    segment: 'B2B',
    created_at: '2026-10-21',
    updated_at: '2026-10-25',
    synced_at: '2026-10-26',
  },
];

const mockManagers: ManagerConfig[] = [
  { id: 'm1', name: 'Иван Петров', role: 'Ведущий менеджер', capacity: 30 },
  { id: 'm2', name: 'Ольга Сидорова', role: 'Менеджер ОП', capacity: 25 },
];

describe('RnpStandupView', () => {
  it('renders 5-minute timer and allows start/pause and reset', () => {
    vi.useFakeTimers();

    render(
      <RnpStandupView
        calls={mockCalls}
        deals={mockDeals}
        managers={mockManagers}
        planTarget={2000000}
      />
    );

    const timer = screen.getByTestId('standup-timer-display');
    expect(timer).toHaveTextContent('05:00');

    const toggleBtn = screen.getByTestId('btn-standup-timer-toggle');
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveTextContent('Пауза');

    // Advance 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(timer).toHaveTextContent('04:55');

    // Reset timer
    const resetBtn = screen.getByTestId('btn-standup-timer-reset');
    fireEvent.click(resetBtn);
    expect(timer).toHaveTextContent('05:00');

    vi.useRealTimers();
  });

  it('renders yesterday factual actions recap and manager cards with traffic light badges', () => {
    render(
      <RnpStandupView
        calls={mockCalls}
        deals={mockDeals}
        managers={mockManagers}
        planTarget={2000000}
      />
    );

    expect(screen.getByText(/Утренняя планёрка РОПа/i)).toBeInTheDocument();
    expect(screen.getByText(/Целевые звонки/i)).toBeInTheDocument();
    expect(screen.getByText(/Назначено Zoom\/встреч/i)).toBeInTheDocument();

    // Manager cards
    expect(screen.getByTestId('manager-card-m1')).toBeInTheDocument();
    expect(screen.getByTestId('manager-card-m2')).toBeInTheDocument();
    expect(screen.getAllByText('Иван Петров').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Ольга Сидорова').length).toBeGreaterThanOrEqual(1);
    // Hourly Heatmap integration
    expect(screen.getByText(/Температурная карта звонков/i)).toBeInTheDocument();
  });

  it('displays critical SLA risk deals section', () => {
    render(
      <RnpStandupView
        calls={mockCalls}
        deals={mockDeals}
        managers={mockManagers}
        planTarget={2000000}
      />
    );

    expect(screen.getByText(/Ключевые сделки с риском срыва регламента/i)).toBeInTheDocument();
    expect(screen.getByText('Крупная поставка')).toBeInTheDocument();
    expect(screen.getByText(/500 000 ₽/i)).toBeInTheDocument();
  });

  it('evaluates personal KPIs and selects prioritized primary risk with tailored action directive', () => {
    const kpiManagers: ManagerConfig[] = [
      {
        id: 'm1',
        name: 'Иван Петров',
        role: 'РОП / Клоузер',
        capacity: 40,
        revenue_target: 1500000,
        daily_calls_target: 20,
        monthly_meetings_target: 15,
        next_step_target_pct: 80,
      },
      {
        id: 'm2',
        name: 'Ольга Сидорова',
        role: 'Менеджер ОП',
        capacity: 30,
        revenue_target: 1200000,
        daily_calls_target: 25,
        monthly_meetings_target: 15,
        next_step_target_pct: 80,
      },
    ];

    render(
      <RnpStandupView
        calls={mockCalls}
        deals={mockDeals}
        managers={kpiManagers}
        planTarget={5000000}
      />
    );

    // Olga has audited call with next_step: 0 (0% vs 80% target)
    // Priority 1 triggers: Quality of Next Step
    expect(
      screen.getByText(/Качество фиксации договорённостей \(Next Step\)/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Next Step: 0% при нормативе 80%/i)).toBeInTheDocument();
    expect(screen.getByText(/РОПу прослушать/i)).toBeInTheDocument();

    // Verify 5-KPI chips are rendered
    expect(screen.getAllByText(/Звонки \(факт\/план\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Next Step \(ИИ\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Zoom \(факт\/план\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Вместимость воронки/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Выручка \(факт \/ план\)/i).length).toBeGreaterThanOrEqual(1);
  });

  it('respects meetings_enabled: false and does not trigger meeting alarms', () => {
    const disabledMeetingsManagers: ManagerConfig[] = [
      {
        id: 'm1',
        name: 'Иван Петров',
        role: 'Клоузер',
        capacity: 40,
        revenue_target: 1500000,
        daily_calls_target: 20,
        monthly_meetings_target: 15,
        meetings_enabled: false,
        next_step_target_pct: 80,
      },
    ];

    render(
      <RnpStandupView
        calls={mockCalls}
        deals={mockDeals}
        managers={disabledMeetingsManagers}
        planTarget={1500000}
      />
    );

    // Meeting chip displays disabled marker
    expect(screen.getByText(/— \(Откл\.\)/i)).toBeInTheDocument();
    // No priority 3 meeting risk alarm triggered
    expect(screen.queryByText(/Отставание по назначенным встречам/i)).not.toBeInTheDocument();
  });
});


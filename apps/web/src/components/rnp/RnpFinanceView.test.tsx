/**
 * apps/web/src/components/rnp/RnpFinanceView.test.tsx
 *
 * Unit tests for RnpFinanceView component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RnpFinanceView } from './RnpFinanceView';
import type { Deal, ManagerConfig, StageConfig } from '@/types/api';

const mockDeals: Deal[] = [
  {
    id: 'd1',
    deal_id: 'd1',
    org_id: 'org1',
    crm_deal_id: '101',
    crm_source: 'amoCRM',
    title: 'Сделка 1',
    amount: 1000000,
    amount_str: '1 000 000 ₽',
    stage_id: 's1',
    stage: 'КП отправлено',
    status: 'active',
    sla_risk: false,
    responsible_user: 'Иван',
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
    title: 'Сделка 2',
    amount: 500000,
    amount_str: '500 000 ₽',
    stage_id: 's2',
    stage: 'Счет на оплате',
    status: 'active',
    sla_risk: false,
    responsible_user: 'Ольга',
    segment: 'B2B',
    created_at: '2026-10-21',
    updated_at: '2026-10-21',
    synced_at: '2026-10-26',
  },
];

const mockStages: StageConfig[] = [
  { id: 1, name: 'КП отправлено', sla_hours: 48, win_pct: 60 },
  { id: 2, name: 'Счет на оплате', sla_hours: 24, win_pct: 85 },
];

const mockManagers: ManagerConfig[] = [
  { id: 'm1', name: 'Иван', role: 'Менеджер', capacity: 30 },
  { id: 'm2', name: 'Ольга', role: 'Менеджер', capacity: 30 },
];

describe('RnpFinanceView', () => {
  it('renders plan, weighted pipeline, and coverage ratio', () => {
    render(
      <RnpFinanceView
        deals={mockDeals}
        managers={mockManagers}
        stages={mockStages}
        planTarget={5000000}
        revenue={2000000}
      />
    );

    expect(screen.getByText(/План выручки \(Цель\)/i)).toBeInTheDocument();
    expect(screen.getByText('5 000 000 ₽')).toBeInTheDocument();
    expect(screen.getByText(/Взвешенный пайплайн/i)).toBeInTheDocument();
    expect(screen.getByText(/Покрытие плана \(Coverage\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Выручка на 1 менеджера/i)).toBeInTheDocument();
  });

  it('renders capitalization per stage breakdown', () => {
    render(
      <RnpFinanceView
        deals={mockDeals}
        managers={mockManagers}
        stages={mockStages}
        planTarget={5000000}
        revenue={2000000}
      />
    );

    expect(screen.getByText(/Капитализация этапов воронки/i)).toBeInTheDocument();
    expect(screen.getByText(/КП отправлено/i)).toBeInTheDocument();
    expect(screen.getByText(/Счет на оплате/i)).toBeInTheDocument();
  });
});

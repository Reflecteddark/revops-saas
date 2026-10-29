/**
 * apps/web/src/components/rnp/RnpMarketingView.test.tsx
 *
 * Unit tests for RnpMarketingView component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RnpMarketingView } from './RnpMarketingView';
import type { Deal, ManagerConfig } from '@/types/api';

const mockDeals: Deal[] = [
  {
    id: 'd1',
    deal_id: 'd1',
    org_id: 'org1',
    crm_deal_id: '101',
    crm_source: 'amoCRM реклама',
    title: 'Заявка с сайта 1',
    amount: 100000,
    amount_str: '100 000 ₽',
    stage_id: 's1',
    stage: 'Квалификация пройдена',
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
    crm_source: 'Bitrix24 форма',
    title: 'Заявка с сайта 2',
    amount: 200000,
    amount_str: '200 000 ₽',
    stage_id: 's2',
    stage: 'КП отправлено',
    status: 'active',
    sla_risk: false,
    responsible_user: 'Ольга',
    segment: 'B2B',
    created_at: '2026-10-21',
    updated_at: '2026-10-21',
    synced_at: '2026-10-26',
  },
];

const mockManagers: ManagerConfig[] = [
  { id: 'm1', name: 'Иван', role: 'Менеджер', capacity: 40 },
  { id: 'm2', name: 'Ольга', role: 'Менеджер', capacity: 40 },
];

describe('RnpMarketingView', () => {
  it('renders marketing KPI cards with inbound leads and SQL qualification %', () => {
    render(<RnpMarketingView deals={mockDeals} managers={mockManagers} />);

    expect(screen.getByText(/Входящих лидов \(MTD\)/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText(/Доля SQL-квалификации/i)).toBeInTheDocument();
    expect(screen.getByText(/SLA первого контакта/i)).toBeInTheDocument();
    expect(screen.getByText(/Загрузка отдела продаж/i)).toBeInTheDocument();
  });

  it('renders channels breakdown and AI traffic balancing recommendation', () => {
    render(<RnpMarketingView deals={mockDeals} managers={mockManagers} />);

    expect(screen.getByText(/Источники CRM/i)).toBeInTheDocument();
    expect(screen.getByText('amoCRM реклама')).toBeInTheDocument();
    expect(screen.getByText('Bitrix24 форма')).toBeInTheDocument();
    expect(screen.getByText(/Балансировка трафика и вместимости/i)).toBeInTheDocument();
  });
});

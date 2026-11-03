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

// created this month (Moscow) so they count as MTD leads
const NOW_ISO = new Date().toISOString();

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
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
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
    created_at: NOW_ISO,
    updated_at: NOW_ISO,
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

  it('counts MTD leads by creation date and does not advise on a tiny sample', () => {
    const old = mockDeals.map((d) => ({ ...d, created_at: '2026-01-05T10:00:00Z' }));
    render(<RnpMarketingView deals={old} managers={mockManagers} />);

    // nothing was created this month
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText(/Недостаточно данных для рекомендации/i)).toBeInTheDocument();
    expect(screen.queryByText(/масштабировать рекламу/i)).not.toBeInTheDocument();
  });

  it('renders channels breakdown and AI traffic balancing recommendation', () => {
    render(<RnpMarketingView deals={mockDeals} managers={mockManagers} />);

    expect(screen.getByText(/Источники CRM/i)).toBeInTheDocument();
    expect(screen.getByText('amoCRM реклама')).toBeInTheDocument();
    expect(screen.getByText('Bitrix24 форма')).toBeInTheDocument();
    expect(screen.getByText(/Балансировка трафика и вместимости/i)).toBeInTheDocument();
  });
});

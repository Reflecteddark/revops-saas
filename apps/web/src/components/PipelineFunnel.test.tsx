/**
 * apps/web/src/components/PipelineFunnel.test.tsx
 *
 * Unit tests for PipelineFunnel component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PipelineFunnel } from './PipelineFunnel';
import type { Deal } from '@/types/api';

const mockDeals: Deal[] = [
  {
    id: 'd-1',
    deal_id: '101',
    org_id: 'org-1',
    crm_deal_id: 'crm-101',
    crm_source: 'amocrm',
    title: 'Поставка станков',
    amount: 1000000,
    amount_str: '1 000 000 ₽',
    stage_id: '5',
    stage: 'Оплата получена',
    status: 'won',
    sla_risk: false,
    responsible_user: 'Иван Иванов',
    segment: 'Enterprise',
    created_at: '2026-10-20',
    updated_at: '2026-10-24',
    synced_at: '2026-10-24',
  },
  {
    id: 'd-2',
    deal_id: '102',
    org_id: 'org-1',
    crm_deal_id: 'crm-102',
    crm_source: 'amocrm',
    title: 'Сервисный контракт',
    amount: 500000,
    amount_str: '500 000 ₽',
    stage_id: '2',
    stage: 'Встреча проведена',
    status: 'active',
    sla_risk: false,
    responsible_user: 'Петр Сидоров',
    segment: 'SMB',
    created_at: '2026-10-22',
    updated_at: '2026-10-24',
    synced_at: '2026-10-24',
  },
];

describe('PipelineFunnel', () => {
  it('renders all 5 stages of SSOT funnel', () => {
    render(<PipelineFunnel deals={mockDeals} />);

    expect(screen.getByTestId('pipeline-funnel')).toBeInTheDocument();
    expect(screen.getByText('1. Квалификация')).toBeInTheDocument();
    expect(screen.getByText('2. Встреча проведена / Zoom')).toBeInTheDocument();
    expect(screen.getByText('3. Коммерческое предложение')).toBeInTheDocument();
    expect(screen.getByText('4. Согласование договора')).toBeInTheDocument();
    expect(screen.getByText('5. Оплата (Closed-Won)')).toBeInTheDocument();
  });

  it('calculates amounts and conversion correctly', () => {
    render(<PipelineFunnel deals={mockDeals} />);

    // Stage 1 and 2 include both deals (1.5M)
    expect(screen.getAllByText(/1.*500.*000.*₽/).length).toBeGreaterThanOrEqual(1);
    // Stage 3, 4, 5 include won deal (1.0M)
    expect(screen.getAllByText(/1.*000.*000.*₽/).length).toBeGreaterThanOrEqual(1);
    // Conversion headline badge
    expect(screen.getByText(/конверсия в оплату:/i)).toBeInTheDocument();
  });

  it('renders skeleton in loading state', () => {
    render(<PipelineFunnel loading={true} />);

    expect(screen.getByTestId('pipeline-funnel-loading')).toBeInTheDocument();
  });
});

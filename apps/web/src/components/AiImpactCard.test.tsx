/**
 * apps/web/src/components/AiImpactCard.test.tsx
 *
 * Unit tests for AiImpactCard component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AiImpactCard } from './AiImpactCard';
import type { Call, Deal } from '@/types/api';

const mockCalls: Call[] = [
  {
    id: 'c-1',
    deal_id: 'd-1',
    deal_title: 'Сделка 1',
    client: 'ООО Альфа',
    manager: 'Иван',
    stage: 'КП',
    duration: '03:10',
    amount: '500 000 ₽',
    amount_num: 500000,
    score: 12,
    status: 'won',
    status_label: 'Успешно',
    risk_amount: '0 ₽',
    next_step: 1,
    date: '2026-10-24 10:00',
    cr: [],
    error_summary: '',
    recommendation: '',
    transcript: '',
  },
  {
    id: 'c-2',
    deal_id: 'd-2',
    deal_title: 'Сделка 2',
    client: 'ЗАО Бета',
    manager: 'Ольга',
    stage: 'Встреча',
    duration: '02:00',
    amount: '100 000 ₽',
    amount_num: 100000,
    score: 4,
    status: 'risk',
    status_label: 'Слив',
    risk_amount: '100 000 ₽',
    next_step: 0,
    date: '2026-10-24 11:00',
    cr: [],
    error_summary: '',
    recommendation: '',
    transcript: '',
  },
];

describe('AiImpactCard', () => {
  it('renders all 3 quality tiers with metrics', () => {
    render(<AiImpactCard calls={mockCalls} />);

    expect(screen.getByTestId('ai-impact-card')).toBeInTheDocument();
    expect(screen.getByText('Зона риска (Низкий балл)')).toBeInTheDocument();
    expect(screen.getByText('Рабочая норма (Средний)')).toBeInTheDocument();
    expect(screen.getByText('Эталонные переговоры')).toBeInTheDocument();
    // no won deal yet -> no conversion is invented
    expect(screen.getByText(/Сбор статистики/i)).toBeInTheDocument();
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument();
  });

  it('detects and flags Fake Yes alert calls', () => {
    render(<AiImpactCard calls={mockCalls} />);

    expect(screen.getByTestId('fake-yes-strip')).toBeInTheDocument();
    expect(
      screen.getByText(/1 звонков без зафиксированного следующего шага/i)
    ).toBeInTheDocument();
  });

  it('computes conversion from won DEALS, not from the call score', () => {
    const wonDeal = { id: 'd-1', deal_id: 'd-1', crm_deal_id: '1', status: 'won' } as unknown as Deal;
    render(<AiImpactCard calls={mockCalls} deals={[wonDeal]} />);

    // the only call of the 9-13 tier belongs to the won deal -> 100.0%; the 0-5 tier call to an open one -> 0.0%
    expect(screen.getByText('100.0%')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });
});

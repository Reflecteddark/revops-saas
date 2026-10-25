/**
 * apps/web/src/components/AiImpactCard.test.tsx
 *
 * Unit tests for AiImpactCard component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AiImpactCard } from './AiImpactCard';
import type { Call } from '@/types/api';

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
    expect(screen.getByText('4.8x МАКСИМУМ')).toBeInTheDocument();
  });

  it('detects and flags Fake Yes alert calls', () => {
    render(<AiImpactCard calls={mockCalls} />);

    expect(screen.getByTestId('fake-yes-strip')).toBeInTheDocument();
    expect(screen.getByText(/1 алертов «Ложного согласия»/i)).toBeInTheDocument();
  });
});

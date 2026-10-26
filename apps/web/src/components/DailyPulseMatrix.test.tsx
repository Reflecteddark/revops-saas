/**
 * apps/web/src/components/DailyPulseMatrix.test.tsx
 *
 * Unit tests for DailyPulseMatrix component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DailyPulseMatrix } from './DailyPulseMatrix';
import type { Call } from '@/types/api';

const mockCalls = [
  {
    id: 'call-1',
    deal_id: 'deal-101',
    client: 'ООO Тест',
    manager: 'Алексей Смирнов',
    score: 11,
    status: 'won',
    date: '2026-10-25 10:00',
  },
  {
    id: 'call-2',
    deal_id: 'deal-102',
    client: 'ИП Иванов',
    manager: 'Михаил Ковалёв',
    score: 5,
    status: 'lost',
    date: '2026-10-25 11:30',
  },
] as unknown as Call[];

describe('DailyPulseMatrix', () => {
  it('renders matrix header, manager rows, and inline sparklines', () => {
    render(<DailyPulseMatrix calls={mockCalls} />);

    expect(
      screen.getByText('Рука на пульсе: Дневная матрица активности и качества')
    ).toBeInTheDocument();
    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.getByText('Михаил Ковалёв')).toBeInTheDocument();
  });

  it('filters managers when search query is entered', () => {
    render(<DailyPulseMatrix calls={mockCalls} />);

    const searchInput = screen.getByPlaceholderText('Менеджер...');
    fireEvent.change(searchInput, { target: { value: 'Алексей' } });

    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.queryByText('Михаил Ковалёв')).not.toBeInTheDocument();
  });

  it('switches metric mode on pill click', () => {
    render(<DailyPulseMatrix calls={mockCalls} />);

    const scorePill = screen.getByText('Баллы (CR)');
    fireEvent.click(scorePill);

    expect(scorePill).toHaveClass('font-semibold');
  });

  it('renders honest empty state when calls list is empty', () => {
    render(<DailyPulseMatrix calls={[]} />);
    expect(
      screen.getByText('За последние 7 дней звонков менеджеров не зафиксировано')
    ).toBeInTheDocument();
  });
});

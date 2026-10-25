/**
 * apps/web/src/components/RopPodium.test.tsx
 *
 * Unit tests for RopPodium component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RopPodium } from './RopPodium';
import type { Call } from '@/types/api';

const mockCalls: Call[] = [
  {
    id: 'c-1',
    deal_id: 'd-1',
    deal_title: 'Сделка 1',
    client: 'ООО Альфа',
    manager: 'Иван Петров',
    stage: 'КП',
    duration: '03:10',
    amount: '300 000 ₽',
    amount_num: 300000,
    score: 12,
    status: 'won',
    status_label: 'Успешно',
    risk_amount: '0 ₽',
    next_step: 1,
    date: '2026-10-24 10:00',
    cr: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    error_summary: '',
    recommendation: 'Супер',
    transcript: '...',
  },
  {
    id: 'c-2',
    deal_id: 'd-2',
    deal_title: 'Сделка 2',
    client: 'ЗАО Бета',
    manager: 'Ольга Смирнова',
    stage: 'Встреча',
    duration: '02:00',
    amount: '100 000 ₽',
    amount_num: 100000,
    score: 5,
    status: 'lost',
    status_label: 'Слив',
    risk_amount: '100 000 ₽',
    next_step: 0,
    date: '2026-10-24 11:00',
    cr: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    error_summary: 'Слив',
    recommendation: 'Обучить',
    transcript: '...',
  },
  {
    id: 'c-3',
    deal_id: 'd-3',
    deal_title: 'Сделка 3',
    client: 'ПАО Гамма',
    manager: 'Виктор Сидоров',
    stage: 'Оплата',
    duration: '04:00',
    amount: '400 000 ₽',
    amount_num: 400000,
    score: 10,
    status: 'won',
    status_label: 'Успешно',
    risk_amount: '0 ₽',
    next_step: 1,
    date: '2026-10-24 12:00',
    cr: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
    error_summary: '',
    recommendation: '',
    transcript: '...',
  },
];

describe('RopPodium', () => {
  it('renders empty state when no calls are passed', () => {
    render(<RopPodium calls={[]} />);

    expect(screen.getByTestId('rop-podium-empty')).toBeInTheDocument();
    expect(screen.getByText('Нет данных для пьедестала')).toBeInTheDocument();
  });

  it('renders 1st, 2nd, and 3rd rank podium cards', () => {
    render(<RopPodium calls={mockCalls} />);

    expect(screen.getByTestId('rop-podium')).toBeInTheDocument();
    expect(screen.getByTestId('podium-card-1')).toHaveTextContent(
      'Иван Петров'
    );
    expect(screen.getByTestId('podium-card-2')).toHaveTextContent(
      'Виктор Сидоров'
    );
    expect(screen.getByTestId('podium-card-3')).toHaveTextContent(
      'Ольга Смирнова'
    );
  });

  it('renders hazard manager alert and fires callback on click', () => {
    const handleSelect = vi.fn();
    render(<RopPodium calls={mockCalls} onSelectRep={handleSelect} />);

    expect(screen.getByTestId('hazard-rep-alert')).toBeInTheDocument();
    expect(screen.getByText('P0 Зона критического риска')).toBeInTheDocument();

    const reviewBtn = screen.getByRole('button', { name: /разбор/i });
    fireEvent.click(reviewBtn);

    expect(handleSelect).toHaveBeenCalledWith('Ольга Смирнова');
  });
});

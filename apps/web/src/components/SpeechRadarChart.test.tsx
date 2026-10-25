/**
 * apps/web/src/components/SpeechRadarChart.test.tsx
 *
 * Unit tests for SpeechRadarChart component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SpeechRadarChart } from './SpeechRadarChart';
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
    score: 11,
    status: 'won',
    status_label: 'Успешно',
    risk_amount: '0 ₽',
    next_step: 1,
    date: '2026-10-24 10:00',
    cr: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
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
];

describe('SpeechRadarChart', () => {
  it('renders radar chart with legend and rep switcher pills', () => {
    render(<SpeechRadarChart calls={mockCalls} />);

    expect(screen.getByTestId('speech-radar-chart')).toBeInTheDocument();
    expect(screen.getByText('Вся команда')).toBeInTheDocument();
    expect(screen.getByText('Иван Петров')).toBeInTheDocument();
    expect(screen.getByText('Ольга Смирнова')).toBeInTheDocument();
    expect(screen.getByText('Эталон B2B (100%)')).toBeInTheDocument();
  });

  it('calls onSelectRep when rep pill is clicked', () => {
    const handleSelect = vi.fn();
    render(<SpeechRadarChart calls={mockCalls} onSelectRep={handleSelect} />);

    const olgaBtn = screen.getByRole('button', { name: 'Ольга Смирнова' });
    fireEvent.click(olgaBtn);

    expect(handleSelect).toHaveBeenCalledWith('Ольга Смирнова');
  });
});

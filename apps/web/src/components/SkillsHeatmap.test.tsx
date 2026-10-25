/**
 * apps/web/src/components/SkillsHeatmap.test.tsx
 *
 * Unit tests for SkillsHeatmap component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SkillsHeatmap } from './SkillsHeatmap';
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

describe('SkillsHeatmap', () => {
  it('renders empty state when no calls are passed', () => {
    render(<SkillsHeatmap calls={[]} />);

    expect(screen.getByTestId('skills-heatmap-empty')).toBeInTheDocument();
    expect(screen.getByText('Нет данных о менеджерах')).toBeInTheDocument();
  });

  it('renders managers with score and criteria rates', () => {
    render(<SkillsHeatmap calls={mockCalls} />);

    expect(screen.getByTestId('skills-heatmap')).toBeInTheDocument();
    expect(screen.getByText('Иван Петров')).toBeInTheDocument();
    expect(screen.getByText('Ольга Смирнова')).toBeInTheDocument();
    expect(screen.getByText('Эталон звонков')).toBeInTheDocument();
    expect(screen.getByText('Зона риска')).toBeInTheDocument();
  });

  it('calls onSelectRep when a manager row is clicked', () => {
    const handleSelect = vi.fn();
    render(<SkillsHeatmap calls={mockCalls} onSelectRep={handleSelect} />);

    const ivanRow = screen.getByTestId('skill-row-Иван Петров');
    fireEvent.click(ivanRow);

    expect(handleSelect).toHaveBeenCalledWith('Иван Петров');
  });
});

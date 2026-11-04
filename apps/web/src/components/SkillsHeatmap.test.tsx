/**
 * apps/web/src/components/SkillsHeatmap.test.tsx
 *
 * Unit tests for SkillsHeatmap component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SkillsHeatmap } from './SkillsHeatmap';
import { failedCall, makeCall, missedCall, ratedCalls } from '@/test/callFactory';

const team = [...ratedCalls('Иван Петров', 11), ...ratedCalls('Ольга Смирнова', 5)];

describe('SkillsHeatmap', () => {
  it('renders empty state when no calls are passed', () => {
    render(<SkillsHeatmap calls={[]} />);

    expect(screen.getByTestId('skills-heatmap-empty')).toBeInTheDocument();
    expect(screen.getByText('Нет данных о менеджерах')).toBeInTheDocument();
  });

  it('renders managers with score and roles', () => {
    render(<SkillsHeatmap calls={team} />);

    expect(screen.getByTestId('skills-heatmap')).toBeInTheDocument();
    expect(screen.getByText('Иван Петров')).toBeInTheDocument();
    expect(screen.getByText('Ольга Смирнова')).toBeInTheDocument();
    expect(screen.getByText('Эталон звонков')).toBeInTheDocument();
    expect(screen.getByText('Зона риска')).toBeInTheDocument();
  });

  it('calls onSelectRep when a manager row is clicked', () => {
    const handleSelect = vi.fn();
    render(<SkillsHeatmap calls={team} onSelectRep={handleSelect} />);

    fireEvent.click(screen.getByTestId('skill-row-Иван Петров'));
    expect(handleSelect).toHaveBeenCalledWith('Иван Петров');
  });

  it('draws a real 0% as a red "0%", and "—" only where nothing was assessed', () => {
    const calls = ratedCalls('Иван Петров', 5, 3, { cr: [0, 1, ...Array(11).fill(null)] as never });
    render(<SkillsHeatmap calls={calls} />);

    const row = screen.getByTestId('skill-row-Иван Петров');
    const cells = row.querySelectorAll('button');
    expect(cells[0]).toHaveTextContent('0%'); // CR1: assessed three times, never passed
    expect(cells[0]).toHaveClass('text-rose-600');
    expect(cells[1]).toHaveTextContent('100%');
    expect(cells[2]).toHaveTextContent('—'); // CR3: never assessed
    expect(cells[2]).not.toHaveClass('text-rose-600');
    expect(cells[0].title).toContain('0% (0 из 3 оценённых)');
  });

  it('shows how many calls are not rated and why, and the legend even without them', () => {
    const calls = [...team, missedCall({ manager: 'Иван Петров' }), failedCall({ manager: 'Иван Петров' }), makeCall({ manager: 'Не определён' })];
    render(<SkillsHeatmap calls={calls} />);

    expect(screen.getByTestId('heatmap-excluded')).toHaveTextContent('Без менеджера из CRM: 1 звонок — в рейтингах менеджеров не участвуют');
    expect(screen.getByTestId('heatmap-excluded')).toHaveTextContent('Оценки нет: недозвонов 1, сбоев анализа 1');
    expect(screen.queryByText('Не определён')).not.toBeInTheDocument();
  });

  it('shows the legend when every call is rated', () => {
    render(<SkillsHeatmap calls={team} />);
    expect(screen.getByText('≥80% норма')).toBeInTheDocument();
    expect(screen.getByTestId('heatmap-excluded')).toHaveTextContent('Все звонки учтены');
  });

  it('gives no role to a manager with too few rated calls', () => {
    render(<SkillsHeatmap calls={ratedCalls('Иван Петров', 12, 2)} />);
    expect(screen.getByText('Мало данных: 2 из 3')).toBeInTheDocument();
    expect(screen.queryByText('Эталон звонков')).not.toBeInTheDocument();
  });

  it('shows no score for a manager whose calls are all missed or failed', () => {
    render(<SkillsHeatmap calls={[missedCall({ manager: 'Иван Петров' }), failedCall({ manager: 'Иван Петров' })]} />);
    const row = screen.getByTestId('skill-row-Иван Петров');
    expect(row).toHaveTextContent('Нет оценённых звонков');
    expect(row).not.toHaveTextContent('0.0');
  });

  it('does not add the same call to two lists: a missed call of an unattributed manager is counted in both facts apart', () => {
    const calls = [...team, missedCall({ manager: 'Не определён' }), missedCall({ manager: 'Не определён' })];
    render(<SkillsHeatmap calls={calls} />);

    // two separate facts, not one list whose numbers add up to more than the calls
    expect(screen.getByTestId('heatmap-excluded')).toHaveTextContent('Без менеджера из CRM: 2 звонка');
    expect(screen.getByTestId('heatmap-excluded')).toHaveTextContent('Оценки нет: недозвонов 2, сбоев анализа 0');
    expect(screen.getByTestId('heatmap-excluded').textContent).not.toContain('Не участвуют в оценке');
  });

  it('explains an empty matrix when no call has a CRM manager', () => {
    render(<SkillsHeatmap calls={ratedCalls('Не определён', 9, 2)} />);
    expect(screen.getByTestId('skills-heatmap-empty')).toHaveTextContent('у 2 звонков его нет');
  });
});

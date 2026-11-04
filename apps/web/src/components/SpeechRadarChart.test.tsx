/**
 * apps/web/src/components/SpeechRadarChart.test.tsx
 *
 * Unit tests for SpeechRadarChart component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SpeechRadarChart } from './SpeechRadarChart';
import { failedCall, missedCall, ratedCalls } from '@/test/callFactory';

const team = [...ratedCalls('Иван Петров', 11, 2), ...ratedCalls('Ольга Смирнова', 5, 1)];

describe('SpeechRadarChart', () => {
  it('renders radar chart with legend and rep switcher pills', () => {
    render(<SpeechRadarChart calls={team} />);

    expect(screen.getByTestId('speech-radar-chart')).toBeInTheDocument();
    expect(screen.getByText('Вся команда')).toBeInTheDocument();
    expect(screen.getByText('Иван Петров')).toBeInTheDocument();
    expect(screen.getByText('Ольга Смирнова')).toBeInTheDocument();
    expect(screen.getByText('Эталон B2B (100%)')).toBeInTheDocument();
  });

  it('calls onSelectRep when rep pill is clicked', () => {
    const handleSelect = vi.fn();
    render(<SpeechRadarChart calls={team} onSelectRep={handleSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ольга Смирнова' }));
    expect(handleSelect).toHaveBeenCalledWith('Ольга Смирнова');
  });

  it('has no pill for "Неизвестен" or "Не определён"; the team polygon counts every rated call, not the missed ones', () => {
    const calls = [...team, ...ratedCalls('Неизвестен', 2, 2), ...ratedCalls('Не определён', 3, 2), missedCall(), failedCall()];
    render(<SpeechRadarChart calls={calls} />);

    expect(screen.queryByRole('button', { name: 'Неизвестен' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Не определён' })).not.toBeInTheDocument();
    expect(screen.getByTestId('speech-radar-chart')).toHaveTextContent('7 оценённых звонков'); // 3 + 2 + 2, same as the KPI row
  });

  it('one manager is counted alone', () => {
    const calls = [...team, ...ratedCalls('Не определён', 3, 4)];
    render(<SpeechRadarChart calls={calls} selectedRep="Иван Петров" />);

    expect(screen.getByTestId('speech-radar-chart')).toHaveTextContent('2 оценённых звонка');
  });

  it('draws no polygon, and says so, when no call was rated', () => {
    const { container } = render(<SpeechRadarChart calls={[missedCall(), failedCall()]} />);

    expect(screen.getByTestId('speech-radar-chart')).toHaveTextContent('нет оценённых звонков');
    expect(container.querySelectorAll('polygon[fill="rgba(139, 92, 246, 0.22)"]')).toHaveLength(0);
  });

  describe('cross-highlight with the heatmap', () => {
    it('hovering an axis reports the hovered criterion and shows its real rate', () => {
      const onHover = vi.fn();
      const calls = ratedCalls('Иван Петров', 5, 3); // CR1..CR5 passed, CR6..CR13 failed
      render(<SpeechRadarChart calls={calls} hoveredCriterion={1} onHoverCriterion={onHover} />);

      expect(screen.getByTestId('radar-hint-value')).toHaveTextContent('100%');
      expect(screen.getByText('Твёрдый Next Step:')).toBeInTheDocument();

      fireEvent.mouseEnter(screen.getByText('Next Step').closest('g') as Element);
      expect(onHover).toHaveBeenCalledWith(1);
      fireEvent.mouseLeave(screen.getByText('Next Step').closest('g') as Element);
      expect(onHover).toHaveBeenLastCalledWith(null);
    });

    it('a real 0% is "0%", and a criterion nobody assessed is a dash, not "0%"', () => {
      const calls = ratedCalls('Иван Петров', 5, 3, { cr: [1, 0, ...Array(11).fill(null)] as never });
      const { rerender } = render(<SpeechRadarChart calls={calls} hoveredCriterion={2} />);
      expect(screen.getByTestId('radar-hint-value')).toHaveTextContent('0%');

      rerender(<SpeechRadarChart calls={calls} hoveredCriterion={3} />);
      expect(screen.getByTestId('radar-hint-value')).toHaveTextContent('—');
      expect(screen.getByTestId('speech-radar-chart')).toHaveTextContent('нет оценённых звонков');
    });

    it('clicking an axis selects its criterion, clicking the hint bar too', () => {
      const onSelect = vi.fn();
      render(<SpeechRadarChart calls={ratedCalls('Иван Петров', 5, 3)} hoveredCriterion={4} onSelectCriterion={onSelect} />);

      fireEvent.click(screen.getByText('Боли').closest('g') as Element);
      expect(onSelect).toHaveBeenCalledWith(3);

      fireEvent.click(screen.getByText(/Фильтровать звонки/));
      expect(onSelect).toHaveBeenLastCalledWith(3);
    });

    it('says a filter is active when the hovered criterion is the selected one', () => {
      render(<SpeechRadarChart calls={ratedCalls('Иван Петров', 5, 3)} selectedCriterion={2} />);
      expect(screen.getByText('Фильтр активен (сбросить)')).toBeInTheDocument();
    });
  });
});

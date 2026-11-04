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
});

/**
 * apps/web/src/components/KpiCard.test.tsx
 *
 * Unit tests for KpiCard component including inverted trend logic.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('renders title, value, and unit correctly', () => {
    render(<KpiCard title="Выручка" value="3 500 000" unit="₽" />);

    expect(screen.getByText('Выручка')).toBeInTheDocument();
    expect(screen.getByText('3 500 000')).toBeInTheDocument();
    expect(screen.getByText('₽')).toBeInTheDocument();
  });

  it('displays skeleton when loading is true and hides value', () => {
    render(<KpiCard title="Выручка" value="3 500 000" loading={true} />);

    expect(screen.getByText('Выручка')).toBeInTheDocument();
    expect(screen.queryByText('3 500 000')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-skeleton')).toBeInTheDocument();
  });

  it('renders upward trend with green text and ArrowUp icon', () => {
    render(
      <KpiCard
        title="Звонков"
        value={1247}
        trend={{ direction: 'up', value: 8, label: 'vs план' }}
      />
    );

    const trendIcon = screen.getByTestId('trend-up');
    expect(trendIcon).toBeInTheDocument();
    expect(screen.getByText('+8%')).toHaveClass('text-emerald-500');
    expect(screen.getByText('vs план')).toBeInTheDocument();
  });

  it('renders downward trend with red text and ArrowDown icon', () => {
    render(
      <KpiCard
        title="SLA риск"
        value={7}
        trend={{ direction: 'down', value: 3, label: 'за сутки' }}
        variant="danger"
      />
    );

    const trendIcon = screen.getByTestId('trend-down');
    expect(trendIcon).toBeInTheDocument();
    expect(screen.getByText('-3%')).toHaveClass('text-red-500');
    expect(screen.getByText('за сутки')).toBeInTheDocument();
  });

  it('ensures tabular-nums class is present on the value element', () => {
    render(<KpiCard title="Конверсия" value="34.2" unit="%" />);

    const valueElement = screen.getByText('34.2');
    expect(valueElement).toHaveClass('tabular-nums');
  });

  it('handles onClick callback when provided', () => {
    const handleClick = vi.fn();
    render(<KpiCard title="Кликабельная" value={100} onClick={handleClick} />);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders downward trend as red when inverted is false (default)', () => {
    render(
      <KpiCard
        title="Обычный показатель"
        value={100}
        trend={{ direction: 'down', value: 5 }}
        inverted={false}
      />
    );

    const downSpan = screen.getByText('-5%');
    expect(downSpan).toHaveClass('text-red-500');
    expect(screen.getByTestId('trend-down')).toBeInTheDocument();
  });

  it('renders downward trend as emerald (green) when inverted is true', () => {
    render(
      <KpiCard
        title="SLA риск"
        value={2}
        trend={{ direction: 'down', value: 3 }}
        inverted={true}
      />
    );

    const downSpan = screen.getByText('-3%');
    expect(downSpan).toHaveClass('text-emerald-500');
    expect(screen.getByTestId('trend-down')).toBeInTheDocument();
  });

  it('renders upward trend as red when inverted is true', () => {
    render(
      <KpiCard
        title="Дефицит до плана"
        value="500 000"
        trend={{ direction: 'up', value: 12 }}
        inverted={true}
      />
    );

    const upSpan = screen.getByText('+12%');
    expect(upSpan).toHaveClass('text-red-500');
    expect(screen.getByTestId('trend-up')).toBeInTheDocument();
  });
});

/**
 * apps/web/src/components/StatusSegmentedBar.test.tsx
 *
 * Unit tests for StatusSegmentedBar component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusSegmentedBar } from './StatusSegmentedBar';

describe('StatusSegmentedBar', () => {
  it('renders title, total counter and segment labels with percentages', () => {
    render(
      <StatusSegmentedBar
        title="Тестовое распределение"
        totalCount={20}
        segments={[
          {
            id: 'seg-1',
            label: 'Успешно',
            count: 10,
            colorClass: 'bg-emerald-500',
            dotColorClass: 'bg-emerald-500',
          },
          {
            id: 'seg-2',
            label: 'В работе',
            count: 10,
            colorClass: 'bg-amber-500',
            dotColorClass: 'bg-amber-500',
          },
        ]}
      />
    );

    expect(screen.getByTestId('status-segmented-bar')).toBeInTheDocument();
    expect(screen.getByText('Тестовое распределение')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('Успешно')).toBeInTheDocument();
    expect(screen.getByText('В работе')).toBeInTheDocument();
    expect(screen.getAllByText('(50%)')).toHaveLength(2);
  });
});

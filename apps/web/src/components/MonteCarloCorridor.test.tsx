/**
 * apps/web/src/components/MonteCarloCorridor.test.tsx
 *
 * Unit tests for MonteCarloCorridor component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MonteCarloCorridor } from './MonteCarloCorridor';

describe('MonteCarloCorridor', () => {
  it('renders P10, P50, and P90 corridors with correct values', () => {
    render(
      <MonteCarloCorridor
        p10={2000000}
        p50={3500000}
        p90={4800000}
        monthlyTarget={3000000}
      />
    );

    expect(screen.getByTestId('monte-carlo-corridor')).toBeInTheDocument();
    expect(screen.getByText('2 000 000 ₽')).toBeInTheDocument();
    expect(screen.getByText('3 500 000 ₽')).toBeInTheDocument();
    expect(screen.getByText('4 800 000 ₽')).toBeInTheDocument();
    expect(screen.getByTestId('target-prob-badge')).toBeInTheDocument();
  });

  it('says the base scenario covers the plan when it is above the target', () => {
    render(
      <MonteCarloCorridor
        p10={3000000}
        p50={5000000}
        p90={7000000}
        monthlyTarget={3200000}
      />
    );

    expect(screen.getByTestId('target-prob-badge')).toHaveTextContent(/156% плана в базовом сценарии/i);
  });

  it('does not invent a probability or a plan when none is set', () => {
    render(<MonteCarloCorridor p10={75000} p50={100000} p90={135000} monthlyTarget={0} />);

    expect(screen.getByTestId('target-prob-badge')).toHaveTextContent(/план не задан/i);
    expect(screen.queryByText(/вероятность/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Монте-Карло/i)).not.toBeInTheDocument();
  });
});

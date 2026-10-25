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

  it('displays high probability badge when target is easily achievable', () => {
    render(
      <MonteCarloCorridor
        p10={3000000}
        p50={5000000}
        p90={7000000}
        monthlyTarget={3200000}
      />
    );

    expect(screen.getByTestId('target-prob-badge')).toHaveTextContent(/твердо в плане/i);
  });
});

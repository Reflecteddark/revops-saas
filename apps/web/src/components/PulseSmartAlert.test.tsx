/**
 * apps/web/src/components/PulseSmartAlert.test.tsx
 *
 * Unit tests for PulseSmartAlert component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PulseSmartAlert } from './PulseSmartAlert';

describe('PulseSmartAlert', () => {
  it('renders nothing when stalledCount is 0', () => {
    const { container } = render(
      <PulseSmartAlert stalledCount={0} stalledAmountRub={0} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders alert message and triggers resolve callback', () => {
    const onResolve = vi.fn();
    render(
      <PulseSmartAlert
        stalledCount={5}
        stalledAmountRub={750000}
        onResolve={onResolve}
      />
    );

    expect(screen.getByTestId('pulse-smart-alert')).toBeInTheDocument();
    expect(screen.getByText(/У 5 сделок не зафиксирован следующий шаг/)).toBeInTheDocument();
    expect(screen.getByText(/750 000 ₽/)).toBeInTheDocument();

    const resolveBtn = screen.getByText('Разобрать сделки');
    fireEvent.click(resolveBtn);
    expect(onResolve).toHaveBeenCalledTimes(1);
  });

  it('toggles explanation when "Почему это важно?" is clicked', () => {
    render(
      <PulseSmartAlert
        stalledCount={3}
        stalledAmountRub={300000}
      />
    );

    const helpBtn = screen.getByText('Почему это важно?');
    fireEvent.click(helpBtn);

    expect(screen.getByText(/Регламент B2B-аудита RevOps/)).toBeInTheDocument();
  });
});

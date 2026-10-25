/**
 * apps/web/src/components/ExpressScenarioCalculator.test.tsx
 *
 * Unit tests for ExpressScenarioCalculator component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ExpressScenarioCalculator } from './ExpressScenarioCalculator';

describe('ExpressScenarioCalculator', () => {
  it('renders initial metrics and sliders correctly', () => {
    render(
      <ExpressScenarioCalculator
        initialLeads={50}
        initialCheck={300000}
        initialManagers={4}
      />
    );

    expect(screen.getByTestId('express-scenario-calculator')).toBeInTheDocument();
    expect(screen.getByText('50 шт')).toBeInTheDocument();
    expect(screen.getByText('300 000 ₽')).toBeInTheDocument();
    expect(screen.getByText('4 чел')).toBeInTheDocument();

    // 50 * 300,000 = 15,000,000 pipeline
    // lost = 15M * 0.28 = 4,200,000 ₽
    expect(screen.getByTestId('exp-lost-rev')).toHaveTextContent(/4.*200.*000/);
    // base = 15M * 0.25 = 3,750,000 ₽
    expect(screen.getByTestId('exp-base-plan')).toHaveTextContent(/3.*750.*000/);
  });

  it('recalculates revenue when leads slider is updated', () => {
    render(
      <ExpressScenarioCalculator
        initialLeads={50}
        initialCheck={200000}
        initialManagers={4}
      />
    );

    const leadsSlider = screen.getByTestId('slider-leads');
    fireEvent.change(leadsSlider, { target: { value: '100' } });

    // 100 * 200,000 = 20,000,000 pipeline
    // lost = 20M * 0.28 = 5,600,000 ₽
    expect(screen.getByTestId('exp-lost-rev')).toHaveTextContent(/5.*600.*000/);
  });
});

/**
 * apps/web/src/components/BusinessEconomicsCard.test.tsx
 *
 * Unit tests for BusinessEconomicsCard component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BusinessEconomicsCard } from './BusinessEconomicsCard';

describe('BusinessEconomicsCard', () => {
  it('renders 3 columns with revenue, losses, and plan metrics', () => {
    render(
      <BusinessEconomicsCard
        revenueRub={3500000}
        revenueTrendPct={15.2}
        pipelineRub={5000000}
        lossRub={850000}
        lossTrendPct={-6.1}
        stalledDealsCount={4}
        fakeYesCount={2}
        targetRub={5000000}
        qualityPct={88}
        corridorConfidencePct={94}
      />
    );

    expect(screen.getByTestId('business-economics-card')).toBeInTheDocument();
    expect(screen.getByText('Экономика продаж & Финансовый контур')).toBeInTheDocument();
    expect(screen.getByText('3 500 000 ₽')).toBeInTheDocument();
    expect(screen.getByText('+15.2%')).toBeInTheDocument();
    expect(screen.getByText('850 000 ₽')).toBeInTheDocument();
    expect(screen.getByText('-6.1%')).toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument();
    expect(screen.getByText('4 сделок')).toBeInTheDocument();
    expect(screen.getByText('2 срывов')).toBeInTheDocument();
  });
});

/**
 * apps/web/src/components/OnboardingChecklist.test.tsx
 *
 * Unit tests for OnboardingChecklist component.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import { OnboardingChecklist } from './OnboardingChecklist';

function renderChecklist(props = {}) {
  const defaultProps = {
    dealsCount: 0,
    callsCount: 0,
    hasPlan: false,
    managersCount: 0,
    hasTelegram: false,
    ...props,
  };

  return render(
    <BrowserRouter>
      <OnboardingChecklist {...defaultProps} />
    </BrowserRouter>
  );
}

describe('OnboardingChecklist', () => {
  it('renders all 5 onboarding steps when workspace is empty', () => {
    renderChecklist();

    expect(screen.getByTestId('onboarding-checklist')).toBeInTheDocument();
    expect(screen.getByText('0 из 5 шагов (0%)')).toBeInTheDocument();
    expect(screen.getByText(/Подключите CRM/i)).toBeInTheDocument();
    expect(screen.getByText(/Дождитесь первых звонков/i)).toBeInTheDocument();
    expect(screen.getByText(/Задайте план продаж на месяц/i)).toBeInTheDocument();
    expect(screen.getByText(/Добавьте менеджеров отдела продаж/i)).toBeInTheDocument();
    expect(screen.getByText(/Подключите Telegram-бота/i)).toBeInTheDocument();
  });

  it('marks steps as completed based on props and updates progress', () => {
    renderChecklist({
      dealsCount: 10,
      callsCount: 5,
      hasPlan: true,
      managersCount: 2,
      hasTelegram: false,
    });

    expect(screen.getByText('4 из 5 шагов (80%)')).toBeInTheDocument();
  });

  it('hides component completely when all 5 steps are completed', () => {
    const { container } = renderChecklist({
      dealsCount: 10,
      callsCount: 5,
      hasPlan: true,
      managersCount: 2,
      hasTelegram: true,
    });

    expect(container.firstChild).toBeNull();
  });

  it('allows user to dismiss checklist with close button', () => {
    renderChecklist();

    expect(screen.getByTestId('onboarding-checklist')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-dismiss-checklist'));
    expect(screen.queryByTestId('onboarding-checklist')).not.toBeInTheDocument();
  });
});

/**
 * apps/web/src/components/LostDealsBanner.test.tsx
 *
 * Unit tests for LostDealsBanner component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LostDealsBanner } from './LostDealsBanner';
import type { Call } from '@/types/api';

const mockCallsNoLeaks: Call[] = [
  {
    id: 'c-1',
    deal_id: 'd-1',
    deal_title: 'Договор поставки',
    client: 'ООО Вектор',
    manager: 'Иван Иванов',
    stage: 'Квалификация',
    duration: '03:15',
    amount: '300 000 ₽',
    amount_num: 300000,
    score: 11,
    status: 'won',
    status_label: 'Успешно',
    risk_amount: '0 ₽',
    next_step: 1,
    date: '2026-10-25 10:00',
    cr: [],
    error_summary: '',
    recommendation: 'Хороший контакт',
    transcript: 'Тест',
  },
];

const mockCallsWithLeaks: Call[] = [
  {
    id: 'c-2',
    deal_id: 'd-2',
    deal_title: 'Внедрение CRM',
    client: 'ЗАО Альфа',
    manager: 'Петр Сидоров',
    stage: 'КП',
    duration: '02:40',
    amount: '500 000 ₽',
    amount_num: 500000,
    score: 5,
    status: 'lost',
    status_label: 'СЛИВ (НЕТ NEXT STEP)',
    risk_amount: '500 000 ₽',
    next_step: 0,
    date: '2026-10-24 15:30',
    cr: [],
    error_summary: 'Не назначена дата следующего созвона',
    recommendation: 'Назначить дату',
    transcript: 'Тест слива',
  },
];

describe('LostDealsBanner', () => {
  it('renders green shield zero-leak state when no leaks exist', () => {
    render(<LostDealsBanner calls={mockCallsNoLeaks} />);

    expect(screen.getByTestId('lost-deals-banner')).toBeInTheDocument();
    expect(screen.getByText(/вчера сливов не было/i)).toBeInTheDocument();
    expect(screen.getByText(/✓ 0 сливов/i)).toBeInTheDocument();
  });

  it('renders leak list with amounts and managers when leaks exist', () => {
    render(<LostDealsBanner calls={mockCallsWithLeaks} filterYesterdayOnly={false} />);

    expect(screen.getByTestId('lost-deals-banner')).toBeInTheDocument();
    expect(screen.getByText('Петр Сидоров')).toBeInTheDocument();
    expect(screen.getByText(/ЗАО Альфа/)).toBeInTheDocument();
    expect(screen.getByText(/Не назначена дата следующего созвона/)).toBeInTheDocument();
    expect(screen.getByText('500 000 ₽')).toBeInTheDocument();
    expect(screen.getByText(/СЛИВ \(НЕТ NEXT STEP\)/)).toBeInTheDocument();
  });

  it('fires onInspectCall callback when "Разбор" button is clicked', () => {
    const handleInspect = vi.fn();
    render(
      <LostDealsBanner
        calls={mockCallsWithLeaks}
        filterYesterdayOnly={false}
        onInspectCall={handleInspect}
      />
    );

    const inspectBtn = screen.getByRole('button', { name: /разбор/i });
    expect(inspectBtn).toBeInTheDocument();
    fireEvent.click(inspectBtn);

    expect(handleInspect).toHaveBeenCalledTimes(1);
    expect(handleInspect).toHaveBeenCalledWith(mockCallsWithLeaks[0]);
  });
});

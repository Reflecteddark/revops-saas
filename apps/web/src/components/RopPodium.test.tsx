/**
 * apps/web/src/components/RopPodium.test.tsx
 *
 * Unit tests for RopPodium component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RopPodium } from './RopPodium';
import { failedCall, makeCall, missedCall, ratedCalls } from '@/test/callFactory';

const team = [
  ...ratedCalls('Иван Петров', 12),
  ...ratedCalls('Виктор Сидоров', 10),
  ...ratedCalls('Ольга Смирнова', 5, 3, { amount_num: 100000, deal_id: 'olga-deal' }),
];

describe('RopPodium', () => {
  it('renders empty state when no calls are passed', () => {
    render(<RopPodium calls={[]} />);

    expect(screen.getByTestId('rop-podium-empty')).toBeInTheDocument();
    expect(screen.getByText('Нет данных для пьедестала')).toBeInTheDocument();
  });

  it('renders 1st, 2nd, and 3rd rank podium cards by the average of rated calls', () => {
    render(<RopPodium calls={team} />);

    expect(screen.getByTestId('rop-podium')).toBeInTheDocument();
    expect(screen.getByTestId('podium-card-1')).toHaveTextContent('Иван Петров');
    expect(screen.getByTestId('podium-card-2')).toHaveTextContent('Виктор Сидоров');
    expect(screen.getByTestId('podium-card-3')).toHaveTextContent('Ольга Смирнова');
  });

  it('renders the hazard manager alert and fires the callback on click', () => {
    const handleSelect = vi.fn();
    render(<RopPodium calls={team} onSelectRep={handleSelect} />);

    expect(screen.getByTestId('hazard-rep-alert')).toBeInTheDocument();
    expect(screen.getByText(/Зона риска: средний балл ниже 6/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /разбор/i }));
    expect(handleSelect).toHaveBeenCalledWith('Ольга Смирнова');
  });

  it('does not rank a manager with fewer than 3 rated calls and says why', () => {
    render(<RopPodium calls={[...ratedCalls('Иван Петров', 12, 2), makeCall({ manager: 'Ольга Смирнова', score: 4 })]} />);

    expect(screen.getByTestId('rop-podium-few')).toHaveTextContent('от 3 оценённых звонков');
    expect(screen.getByTestId('rop-podium-few')).toHaveTextContent('Иван Петров — 2');
    expect(screen.queryByTestId('podium-card-1')).not.toBeInTheDocument();
  });

  it('a missed call and a failed audit do not pull the average down or count as rated', () => {
    const calls = [...ratedCalls('Иван Петров', 12), missedCall({ manager: 'Иван Петров' }), failedCall({ manager: 'Иван Петров' })];
    render(<RopPodium calls={calls} />);

    expect(screen.getByTestId('podium-card-1')).toHaveTextContent('12.0 / 13');
    expect(screen.getByTestId('podium-card-1')).toHaveTextContent('3 оценены');
    expect(screen.queryByTestId('hazard-rep-alert')).not.toBeInTheDocument();
  });

  it('a call without a CRM manager is in no ranking', () => {
    const calls = [...ratedCalls('Иван Петров', 12), ...ratedCalls('Не определён', 2), ...ratedCalls('Неизвестен', 1)];
    render(<RopPodium calls={calls} />);

    expect(screen.getByTestId('podium-card-1')).toHaveTextContent('Иван Петров');
    expect(screen.queryByText('Не определён')).not.toBeInTheDocument();
    expect(screen.queryByText('Неизвестен')).not.toBeInTheDocument();
    expect(screen.queryByTestId('hazard-rep-alert')).not.toBeInTheDocument();
  });

  it('says so when no call has a manager from the CRM', () => {
    render(<RopPodium calls={ratedCalls('Не определён', 9)} />);
    expect(screen.getByTestId('rop-podium-empty')).toHaveTextContent('у 3 звонков его нет');
  });

  it('counts the deals once however many calls they have, and paints Next Step 0% as a failure', () => {
    const calls = ratedCalls('Иван Петров', 12, 3, { deal_id: 'same', amount_num: 500000, next_step: 0 });
    render(<RopPodium calls={calls} />);

    const card = screen.getByTestId('podium-card-1');
    expect(card).toHaveTextContent('Сделок в звонках: 1 на 500 000 ₽');
    expect(card).toHaveTextContent('0% (0 из 3)');
    expect(screen.getByText('0% (0 из 3)')).toHaveClass('text-rose-400');
  });
});

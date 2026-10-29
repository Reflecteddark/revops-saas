/**
 * apps/web/src/components/RopBriefingCard.test.tsx
 *
 * Unit tests for RopBriefingCard component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RopBriefingCard } from './RopBriefingCard';
import type { Call } from '@/types/api';

const mockCalls: Call[] = [
  {
    id: 'c-1',
    deal_id: 'd-1',
    deal_title: 'Сделка 1',
    client: 'ООО Альфа',
    manager: 'Ася',
    stage: 'КП',
    duration: '04:10',
    amount: '500 000 ₽',
    amount_num: 500000,
    score: 12,
    status: 'won',
    status_label: 'Успешно',
    risk_amount: '0 ₽',
    next_step: 1,
    date: '2026-10-28 10:00',
    cr: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    error_summary: '',
    recommendation: 'Эталон',
    transcript: '...',
  },
  {
    id: 'c-2a',
    deal_id: 'd-2',
    deal_title: 'Сделка 2',
    client: 'ЗАО Бета',
    manager: 'Владислав',
    stage: 'Встреча',
    duration: '02:30',
    amount: '300 000 ₽',
    amount_num: 300000,
    score: 5,
    status: 'lost',
    status_label: 'Слив',
    risk_amount: '300 000 ₽',
    next_step: 0,
    date: '2026-10-28 11:00',
    cr: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    error_summary: 'Нет даты и времени',
    recommendation: 'Фиксировать срок',
    transcript: '...',
  },
  {
    id: 'c-2b',
    deal_id: 'd-2',
    deal_title: 'Сделка 2b',
    client: 'ЗАО Бета',
    manager: 'Владислав',
    stage: 'Встреча',
    duration: '01:50',
    amount: '300 000 ₽',
    amount_num: 300000,
    score: 5,
    status: 'lost',
    status_label: 'Слив',
    risk_amount: '300 000 ₽',
    next_step: 0,
    date: '2026-10-28 11:10',
    cr: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    error_summary: 'Слив',
    recommendation: 'Фиксировать срок',
    transcript: '...',
  },
  {
    id: 'c-2c',
    deal_id: 'd-2',
    deal_title: 'Сделка 2c',
    client: 'ЗАО Бета',
    manager: 'Владислав',
    stage: 'Встреча',
    duration: '02:15',
    amount: '300 000 ₽',
    amount_num: 300000,
    score: 5,
    status: 'lost',
    status_label: 'Слив',
    risk_amount: '300 000 ₽',
    next_step: 0,
    date: '2026-10-28 11:20',
    cr: [1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
    error_summary: 'Слив',
    recommendation: 'Фиксировать срок',
    transcript: '...',
  },
  {
    id: 'c-3',
    deal_id: 'd-3',
    deal_title: 'Сделка 3',
    client: 'ИП Гамма',
    manager: 'Автоответчик', // Bot call to verify it's excluded from sales analysis
    stage: 'Квалификация',
    duration: '00:15',
    amount: '0 ₽',
    amount_num: 0,
    score: 0,
    status: 'lost',
    status_label: 'Слив',
    risk_amount: '0 ₽',
    next_step: 0,
    date: '2026-10-28 11:30',
    cr: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    error_summary: 'Робот',
    recommendation: '',
    transcript: '...',
  },
];

describe('RopBriefingCard', () => {
  it('renders empty state when no calls are passed', () => {
    render(<RopBriefingCard calls={[]} />);

    expect(screen.getByTestId('rop-briefing-empty')).toBeInTheDocument();
    expect(screen.getByText('ИИ-Брифинг дня')).toBeInTheDocument();
  });

  it('renders 3 focus points for sales meeting and excludes bot calls', () => {
    render(<RopBriefingCard calls={mockCalls} />);

    expect(screen.getByTestId('rop-briefing-card')).toBeInTheDocument();
    expect(
      screen.getByText('⚡ Фокус дня для планёрки РОПа')
    ).toBeInTheDocument();
    // Excluded 'Автоответчик', 4 real calls
    expect(
      screen.getByText(/Сформировано ИИ на основе аудита 4 звонков/)
    ).toBeInTheDocument();

    // Main flaw
    expect(
      screen.getByText('Главная системная дыра отдела:')
    ).toBeInTheDocument();

    // Top performer
    expect(screen.getByText('Кого похвалить на планёрке:')).toBeInTheDocument();
    expect(screen.getByText('Ася')).toBeInTheDocument();

    // Coaching candidate
    expect(
      screen.getByText('Кого разобрать индивидуально:')
    ).toBeInTheDocument();
    expect(screen.getByText('Владислав')).toBeInTheDocument();
  });

  it('copies agenda to clipboard when clicking copy button', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<RopBriefingCard calls={mockCalls} />);

    const copyBtn = screen.getByTestId('copy-agenda-btn');
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
    const copiedText = writeTextMock.mock.calls[0][0];
    expect(copiedText).toContain('Планёрка ОП');
    expect(copiedText).toContain('Ася');
    expect(copiedText).toContain('Владислав');
  });

  it('triggers onSelectRep when clicking coach candidate', () => {
    const handleSelectRep = vi.fn();
    render(<RopBriefingCard calls={mockCalls} onSelectRep={handleSelectRep} />);

    const vladBtn = screen.getByText('Владислав');
    fireEvent.click(vladBtn);

    expect(handleSelectRep).toHaveBeenCalledWith('Владислав');
  });
});

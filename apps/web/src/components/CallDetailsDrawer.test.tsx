/**
 * apps/web/src/components/CallDetailsDrawer.test.tsx
 *
 * Unit tests for CallDetailsDrawer component.
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CallDetailsDrawer } from './CallDetailsDrawer';
import type { Call } from '@/types/api';

const mockCall: Call = {
  id: 'c-100',
  deal_id: 'd-100',
  deal_title: 'Договор с АгроХолдингом',
  client: 'ООО АгроХолдинг',
  manager: 'Алексей Смирнов',
  stage: 'КП',
  duration: '05:22',
  amount: '1 200 000 ₽',
  amount_num: 1200000,
  score: 11,
  status: 'won',
  status_label: 'Успешно',
  risk_amount: '0 ₽',
  next_step: 1,
  date: '2026-10-25 12:00',
  cr: [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1],
  error_summary: '',
  recommendation: 'Дожать на оплату до пятницы',
  transcript: '— Здравствуйте!\n— Да, счет оплатим завтра утром.',
};

describe('CallDetailsDrawer', () => {
  it('renders call details, score, recommendation, and transcript when open', () => {
    const handleClose = vi.fn();
    render(<CallDetailsDrawer call={mockCall} open={true} onOpenChange={handleClose} />);

    expect(screen.getByTestId('call-details-drawer')).toBeInTheDocument();
    expect(screen.getByText('Договор с АгроХолдингом')).toBeInTheDocument();
    expect(screen.getByText(/Балл: 11\/13/)).toBeInTheDocument();
    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.getByText('Дожать на оплату до пятницы')).toBeInTheDocument();

    const transcript = screen.getByTestId('call-transcript');
    expect(transcript).toBeInTheDocument();
    expect(transcript).toHaveTextContent('счет оплатим завтра утром');

    expect(screen.getByTestId('cr-criteria-grid')).toBeInTheDocument();
  });

  it('shows "н/п", the basis of the score, the summary and the reason of a criterion', () => {
    const call: Call = {
      ...mockCall,
      cr: [1, 1, 1, 1, null, 1, 1, 1, 1, 1, 1, 1, null],
      passed: 11,
      applicable: 11,
      summary: 'Клиент готов платить, ждёт счёт',
      evidence: { cr1: { why: 'Назначил созвон', quote: 'в четверг в три' } },
    };
    render(<CallDetailsDrawer call={call} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByTestId('drawer-call-summary')).toHaveTextContent('Клиент готов платить, ждёт счёт');
    expect(screen.getByTestId('cr-basis')).toHaveTextContent('Пройдено 11 из 11 применимых');
    expect(screen.getByTestId('cr-item-5')).toHaveTextContent('н/п');
    fireEvent.click(within(screen.getByTestId('cr-item-1')).getByRole('button'));
    expect(screen.getByTestId('cr-detail-1')).toHaveTextContent('«в четверг в три»');
  });

  it('has a player only for a call that has a recording', () => {
    const { rerender } = render(<CallDetailsDrawer call={{ ...mockCall, has_audio: true }} open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId('drawer-call-audio-player-play')).toBeInTheDocument();

    rerender(<CallDetailsDrawer call={{ ...mockCall, has_audio: false }} open={true} onOpenChange={vi.fn()} />);
    expect(screen.queryByTestId('drawer-call-audio-player')).not.toBeInTheDocument();
  });

  it('does not render content when open is false', () => {
    render(<CallDetailsDrawer call={mockCall} open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByTestId('call-details-drawer')).not.toBeInTheDocument();
  });
});

/**
 * apps/web/src/components/CallDetailsDrawer.test.tsx
 *
 * Unit tests for CallDetailsDrawer component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('does not render content when open is false', () => {
    render(<CallDetailsDrawer call={mockCall} open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByTestId('call-details-drawer')).not.toBeInTheDocument();
  });
});

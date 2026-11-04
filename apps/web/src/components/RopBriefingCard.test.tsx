/**
 * apps/web/src/components/RopBriefingCard.test.tsx
 *
 * Unit tests for RopBriefingCard component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RopBriefingCard } from './RopBriefingCard';
import { failedCall, makeCall, missedCall, ratedCalls } from '@/test/callFactory';

// Ася 12/13 (CR13 failed), Владислав 5/13 (CR1-5 passed); "Автоответчик" is not a manager but its calls are rated
const team = [...ratedCalls('Ася', 12), ...ratedCalls('Владислав', 5), ...ratedCalls('Автоответчик', 9, 2)];

describe('RopBriefingCard', () => {
  it('renders empty state when no calls are passed', () => {
    render(<RopBriefingCard calls={[]} />);

    expect(screen.getByTestId('rop-briefing-empty')).toBeInTheDocument();
    expect(screen.getByText('Фокус дня')).toBeInTheDocument();
  });

  it('renders 3 focus points for the sales meeting; the weakest criterion counts every rated call', () => {
    render(<RopBriefingCard calls={team} />);

    expect(screen.getByTestId('rop-briefing-card')).toBeInTheDocument();
    expect(screen.getByText('⚡ Фокус дня для планёрки РОПа')).toBeInTheDocument();
    // 8 rated calls (6 of real managers + 2 without a CRM manager), the same set as the KPI row
    expect(screen.getByText(/По 8 оценённым звонкам/)).toBeInTheDocument();

    // The weakest criterion: CR13 is passed in none of the 8 calls
    expect(screen.getByText('Слабое место отдела:')).toBeInTheDocument();
    expect(screen.getByText('Защита маржинальности')).toBeInTheDocument();
    expect(screen.getByText(/Соблюдается в/)).toHaveTextContent('0% оценённых звонков (8 из 8 без зачёта)');

    expect(screen.getByText('Кого похвалить на планёрке:')).toBeInTheDocument();
    expect(screen.getByText('Ася')).toBeInTheDocument();

    expect(screen.getByText('Кого разобрать индивидуально:')).toBeInTheDocument();
    expect(screen.getByText('Владислав')).toBeInTheDocument();
  });

  it('says nothing about people before they have 3 rated calls', () => {
    render(<RopBriefingCard calls={[...ratedCalls('Ася', 12, 2), ...ratedCalls('Владислав', 5, 2)]} />);

    expect(screen.getByText('Слабое место отдела:')).toBeInTheDocument();
    expect(screen.queryByText('Кого похвалить на планёрке:')).not.toBeInTheDocument();
    expect(screen.queryByText('Кого разобрать индивидуально:')).not.toBeInTheDocument();
    expect(screen.getByTestId('briefing-few-calls')).toHaveTextContent('от 3 оценённых звонков');
  });

  it('a missed call and a failed audit are not "criterion not met"', () => {
    const calls = [...ratedCalls('Ася', 13), missedCall({ manager: 'Ася' }), failedCall({ manager: 'Ася' })];
    render(<RopBriefingCard calls={calls} />);

    expect(screen.getByText(/По 3 оценённым звонкам/)).toBeInTheDocument();
    expect(screen.getByText(/Соблюдается в/)).toHaveTextContent('100% оценённых звонков (0 из 3 без зачёта)');
  });

  it('shows the empty state when no call was rated', () => {
    render(<RopBriefingCard calls={[missedCall(), failedCall()]} />);
    expect(screen.getByTestId('rop-briefing-empty')).toBeInTheDocument();
  });

  it('calls without a CRM manager still show the weakest criterion, but nobody is praised or coached', () => {
    render(<RopBriefingCard calls={[makeCall({ manager: 'Не определён', score: 8 })]} />);

    expect(screen.getByText('Слабое место отдела:')).toBeInTheDocument();
    expect(screen.queryByText('Кого похвалить на планёрке:')).not.toBeInTheDocument();
    expect(screen.getByTestId('briefing-few-calls')).toBeInTheDocument();
  });

  it('does not coach the manager it praises', () => {
    render(<RopBriefingCard calls={[...ratedCalls('Ася', 8), ...ratedCalls('Владислав', 5)]} />);

    expect(screen.getByText('Кого похвалить на планёрке:')).toBeInTheDocument();
    expect(screen.getAllByText('Ася')).toHaveLength(1); // praised, not also in the coaching list
    expect(screen.getByText('Владислав')).toBeInTheDocument();
  });

  it('copies agenda to clipboard when clicking copy button', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });

    render(<RopBriefingCard calls={team} />);
    fireEvent.click(screen.getByTestId('copy-agenda-btn'));

    expect(writeTextMock).toHaveBeenCalled();
    const copiedText = writeTextMock.mock.calls[0][0];
    expect(copiedText).toContain('Планёрка ОП');
    expect(copiedText).toContain('Ася');
    expect(copiedText).toContain('Владислав');
    expect(copiedText).toContain('Защита маржинальности');
    expect(copiedText).not.toContain('Автоответчик');
  });

  it('triggers onSelectRep when clicking coach candidate', () => {
    const handleSelectRep = vi.fn();
    render(<RopBriefingCard calls={team} onSelectRep={handleSelectRep} />);

    fireEvent.click(screen.getByText('Владислав'));
    expect(handleSelectRep).toHaveBeenCalledWith('Владислав');
  });

  it('triggers onSelectCriterion with the criterion index', () => {
    const handleCriterion = vi.fn();
    render(<RopBriefingCard calls={team} onSelectCriterion={handleCriterion} />);

    fireEvent.click(screen.getByText('Слабое место отдела:'));
    expect(handleCriterion).toHaveBeenCalledWith(12);
  });
});

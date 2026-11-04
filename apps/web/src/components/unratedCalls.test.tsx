/**
 * An unrated call (score === null) is NOT a 0-point and NOT an 8-point call.
 * RopPodium used to count it as 8, SkillsHeatmap and the Pulse as 0.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RopPodium } from './RopPodium';
import { SkillsHeatmap } from './SkillsHeatmap';
import type { Call } from '@/types/api';

function call(id: string, score: number | null, cr: (0 | 1 | null)[]): Call {
  return {
    id,
    deal_id: `d-${id}`,
    deal_title: 'Сделка',
    client: 'Клиент',
    manager: 'Иван Петров',
    stage: 'КП',
    duration: '03:10',
    amount: '0 ₽',
    amount_num: 0,
    score,
    status: score === null ? 'unknown' : 'won',
    status_label: '',
    risk_amount: '0 ₽',
    next_step: score === null ? null : 1,
    date: '2026-10-24 10:00',
    cr,
    error_summary: '',
    recommendation: '',
    transcript: '',
  } as unknown as Call;
}

const rated = call('r1', 12, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0]);
const rated2 = call('r2', 10, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0]);
const rated3 = call('r3', 11, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0]);
const unrated = call('u1', null, Array(13).fill(null));

describe('unrated calls do not move averages', () => {
  it('RopPodium: average over rated calls only (11.0), not (12+10+11+8)/4 or (12+10+11+0)/4', () => {
    render(<RopPodium calls={[rated, rated2, rated3, unrated]} />);
    expect(screen.getAllByText(/11\.0\s*\/\s*13/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/10\.2\s*\/\s*13/)).not.toBeInTheDocument();
    expect(screen.queryByText(/8\.2\s*\/\s*13/)).not.toBeInTheDocument();
  });

  it('SkillsHeatmap: average over rated calls only (11.0), not (12+10+11+0)/4 = 8.3', () => {
    render(<SkillsHeatmap calls={[rated, rated2, rated3, unrated]} />);
    expect(screen.getAllByText('11.0').length).toBeGreaterThan(0);
    expect(screen.queryByText('8.3')).not.toBeInTheDocument();
  });
});

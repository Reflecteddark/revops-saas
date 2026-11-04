/**
 * A call as /calls/data returns it, for tests. Defaults: a rated 9/13 call of manager "Кристина" with every
 * criterion passed; override what the test is about.
 */

import type { Call } from '@/types/api';

let n = 0;

export function makeCall(over: Partial<Call> = {}): Call {
  n += 1;
  return {
    id: `c-${n}`,
    deal_id: `d-${n}`,
    deal_title: '',
    client: '',
    manager: 'Кристина',
    stage: '',
    duration: '1:00',
    amount: '',
    amount_num: 0,
    score: 9,
    status: 'won',
    status_label: 'ЭТАЛОН',
    risk_amount: '0 ₽',
    next_step: 1,
    date: '2026-11-03 10:00:00',
    cr: Array(13).fill(1),
    error_summary: '',
    recommendation: '',
    transcript: '',
    ...over,
  } as Call;
}

/** Nobody talked: voicemail, a drop. n8n stored it as 13 zeros and score 0; the API now sends no score at all. */
export const missedCall = (over: Partial<Call> = {}) =>
  makeCall({
    kind: 'unanswered',
    status: 'unanswered',
    status_label: 'НЕДОЗВОН',
    score: null,
    next_step: null,
    cr: Array(13).fill(null),
    ...over,
  });

/** The AI could not read the recording. */
export const failedCall = (over: Partial<Call> = {}) =>
  makeCall({
    kind: 'audit_failed',
    status: 'audit_failed',
    status_label: 'СБОЙ АНАЛИЗА',
    score: null,
    next_step: null,
    cr: Array(13).fill(null),
    ...over,
  });

/** `count` rated calls of one manager with the given score (and the criteria all passed or all failed to match it). */
export function ratedCalls(manager: string, score: number, count = 3, over: Partial<Call> = {}): Call[] {
  return Array.from({ length: count }, () =>
    makeCall({
      manager,
      score,
      status: score >= 9 ? 'won' : score >= 6 ? 'norm' : 'risk',
      cr: Array.from({ length: 13 }, (_, i) => (i < score ? 1 : 0)) as Call['cr'],
      ...over,
    })
  );
}

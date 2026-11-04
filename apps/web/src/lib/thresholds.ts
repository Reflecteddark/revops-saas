/**
 * apps/web/src/lib/thresholds.ts
 *
 * Single Source of Truth for call score bands. Based on the 0..13 B2B criteria scale.
 * The backend holds the same table (apps/api/services/call_scorecard.py: SCORE_HIGH_MIN / SCORE_MID_MIN) and
 * tests/test_call_verdict.py keeps the two equal: change both or neither.
 */

export const CALL_SCORE_THRESHOLDS = {
  low: { max: 5, label: 'Срыв', color: 'rose' },
  mid: { min: 6, max: 8, label: 'В норме', color: 'amber' },
  high: { min: 9, label: 'Эталон', color: 'emerald' },
} as const;

export type CallScoreBand = 'high' | 'mid' | 'low' | 'unrated';

/**
 * Band of a call by its 0..13 score. `null`/`undefined` means "not rated yet" and must never be
 * treated as 0 (that used to push unrated calls into "Срыв" and drag the average quality down).
 * An average works too: 8.7 is "В норме".
 */
export function getCallScoreBand(score: number | null | undefined): CallScoreBand {
  if (score === null || score === undefined || Number.isNaN(score)) return 'unrated';
  if (score >= CALL_SCORE_THRESHOLDS.high.min) return 'high';
  if (score >= CALL_SCORE_THRESHOLDS.mid.min) return 'mid';
  return 'low';
}

export const NEXT_STEP_MIN_PCT = 60; // < 60% -> the next step is not fixed often enough
// A manager is ranked, praised or sent to coaching only from this many RATED calls: fewer say nothing about a person.
export const MIN_RATED_CALLS = 3;

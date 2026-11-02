/**
 * apps/web/src/lib/thresholds.ts
 *
 * Single Source of Truth for Call Score Thresholds, Podium limits, and Coaching criteria.
 * Based on 0..13 B2B criteria scale.
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
 */
export function getCallScoreBand(score: number | null | undefined): CallScoreBand {
  if (score === null || score === undefined || Number.isNaN(score)) return 'unrated';
  if (score >= CALL_SCORE_THRESHOLDS.high.min) return 'high';
  if (score >= CALL_SCORE_THRESHOLDS.mid.min) return 'mid';
  return 'low';
}

export const PODIUM_ATTENTION_THRESHOLD = 6; // < 6 -> зона внимания
export const COACHING_THRESHOLD = 8.0;       // < 8.0 -> кандидаты на коучинг
export const HEATMAP_TOP_THRESHOLD = 10.5;   // >= 10.5 -> Эталон звонков
export const NEXT_STEP_MIN_PCT = 60;         // < 60% -> риск срыва следующего шага
export const MIN_CALLS_FOR_COACHING = 3;     // Мин. звонков для попадания в кандидаты на разбор
export const MIN_CALLS_FOR_HEATMAP = 2;      // Мин. звонков для присвоения роли в тепловой карте

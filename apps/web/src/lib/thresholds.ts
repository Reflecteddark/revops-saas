/**
 * apps/web/src/lib/thresholds.ts
 *
 * Single Source of Truth for Call Score Thresholds and Podium Attention limits.
 * Based on 0..13 B2B criteria scale.
 */

export const CALL_SCORE_THRESHOLDS = {
  low: { max: 5, label: 'Срыв', color: 'rose' },
  mid: { min: 6, max: 8, label: 'В норме', color: 'amber' },
  high: { min: 9, label: 'Эталон', color: 'emerald' },
} as const;

export const PODIUM_ATTENTION_THRESHOLD = 6; // <6 -> зона внимания (ранее 8.5)

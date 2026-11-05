/**
 * apps/web/src/components/methodology/shared.ts
 *
 * What the Methodology screens say in the same words everywhere: the verdicts, the error text, the thresholds.
 */

import type { ComparisonStatus, MethodologyVerdict } from '@/types/api';

/** The api client rejects with { detail, status_code }; a validation error may carry a list instead of a sentence. */
export function errorText(err: unknown, fallback: string): string {
  const detail = (err as { detail?: unknown } | null)?.detail;
  return typeof detail === 'string' && detail ? detail : fallback;
}

export const VERDICT_SHORT: Record<MethodologyVerdict, string> = {
  WORKING_STANDARD: 'Стандарт работает',
  SABOTAGE_HIDDEN_GEM: 'Скрытый алмаз',
  HYPOTHESIS_FAILED: 'Не сработало',
  FREESTYLE_STRONGER: 'Своими словами сильнее',
  NO_SIGNAL: 'Явной разницы нет',
  COLLECTING_DATA: 'Сбор данных',
  NOT_SCRIPTED: 'Считает код',
};

export const VERDICT_TONE: Record<MethodologyVerdict, string> = {
  WORKING_STANDARD: 'border-emerald-500/40 bg-emerald-500/5',
  SABOTAGE_HIDDEN_GEM: 'border-dashed border-amber-500/80 bg-amber-500/5',
  HYPOTHESIS_FAILED: 'border-rose-500/40 bg-rose-500/5',
  FREESTYLE_STRONGER: 'border-blue-500/40 bg-blue-500/5',
  NO_SIGNAL: 'border-subtle',
  COLLECTING_DATA: 'border-subtle',
  NOT_SCRIPTED: 'border-subtle opacity-70',
};

export const VERDICT_BADGE: Record<MethodologyVerdict, string> = {
  WORKING_STANDARD: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  SABOTAGE_HIDDEN_GEM: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40',
  HYPOTHESIS_FAILED: 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40',
  FREESTYLE_STRONGER: 'bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/40',
  NO_SIGNAL: 'bg-hover text-secondary border-subtle',
  COLLECTING_DATA: 'bg-hover text-tertiary border-subtle',
  NOT_SCRIPTED: 'bg-hover text-tertiary border-subtle',
};

export const COMPARISON_LABEL: Record<ComparisonStatus, string> = {
  NET_POSITIVE: 'Обновление помогло',
  NET_NEGATIVE: 'Обновление не помогло',
  NEUTRAL: 'Без существенных изменений',
  COLLECTING_DATA: 'Сбор данных',
};

export const COMPARISON_BADGE: Record<ComparisonStatus, string> = {
  NET_POSITIVE: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  NET_NEGATIVE: 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40',
  NEUTRAL: 'bg-hover text-secondary border-subtle',
  COLLECTING_DATA: 'bg-hover text-tertiary border-subtle',
};

/** Why a call could not be judged, in words a РОП understands. */
export const SKIP_REASON: Record<string, string> = {
  no_labels: 'в расшифровке нет разметки реплик «Менеджер:» / «Клиент:»',
  not_assessed: 'звонок не оценён аудитом (недозвон или сбой анализа)',
  no_transcript: 'у звонка нет расшифровки',
  error: 'ошибка при оценке',
};

export function formatSecond(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

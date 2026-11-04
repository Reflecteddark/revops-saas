/**
 * apps/web/src/lib/callStats.ts
 *
 * ONE way to count calls for the audit tab: the podium, the briefing, the radar, the heatmap and the KPI row all read
 * these functions, so the same manager has the same average, Next Step and criteria everywhere.
 *
 * Rules:
 * - only an ASSESSED call (it has a score and the AI really read it) takes part in any average or rate. A missed call
 *   (voicemail, a drop), a failed audit and an unrated call say nothing about a manager;
 * - a manager is a CRM user: a call without one ("Не определён", "Неизвестен") is in no ranking;
 * - a rate over zero calls is `null` ("no data"), never 0: 0% means calls were assessed and none passed.
 */

import { isSystemName } from '@/lib/systemNames';
import { MIN_RATED_CALLS, getCallScoreBand, type CallScoreBand } from '@/lib/thresholds';
import type { Call, CallKind } from '@/types/api';

export type { CallKind };


export function callKind(c: Call): CallKind {
  if (c.kind === 'unanswered' || c.status === 'unanswered') return 'unanswered';
  if (c.kind === 'audit_failed' || c.status === 'audit_failed') return 'audit_failed';
  return typeof c.score === 'number' ? 'assessed' : 'unrated';
}

export const isAssessed = (c: Call): boolean => callKind(c) === 'assessed';

export const hasCrmManager = (c: Call): boolean => !isSystemName(c.manager);

export interface CallSummary {
  total: number;
  assessed: number;
  unanswered: number;
  failed: number;
  unrated: number;
  avgScore: number | null;
  nextStepDone: number;
  nextStepKnown: number;
  nextStepPct: number | null;
}

const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

export function summarizeCalls(calls: Call[]): CallSummary {
  const s: CallSummary = {
    total: calls.length,
    assessed: 0,
    unanswered: 0,
    failed: 0,
    unrated: 0,
    avgScore: null,
    nextStepDone: 0,
    nextStepKnown: 0,
    nextStepPct: null,
  };
  let scoreSum = 0;
  for (const c of calls) {
    const kind = callKind(c);
    if (kind === 'unanswered') s.unanswered += 1;
    else if (kind === 'audit_failed') s.failed += 1;
    else if (kind === 'unrated') s.unrated += 1;
    else {
      s.assessed += 1;
      scoreSum += c.score as number;
      if (c.next_step === 1 || c.next_step === 0) {
        s.nextStepKnown += 1;
        if (c.next_step === 1) s.nextStepDone += 1;
      }
    }
  }
  s.avgScore = s.assessed > 0 ? scoreSum / s.assessed : null;
  s.nextStepPct = pct(s.nextStepDone, s.nextStepKnown);
  return s;
}

/** Amount of the distinct deals behind the calls: one deal with five calls is counted once. */
export function dealsOf(calls: Call[]): { count: number; amount: number } {
  const byDeal = new Map<string, number>();
  for (const c of calls) {
    const id = (c.deal_id || '').trim();
    if (!id) continue;
    byDeal.set(id, Math.max(byDeal.get(id) ?? 0, c.amount_num || 0));
  }
  let amount = 0;
  byDeal.forEach((v) => (amount += v));
  return { count: byDeal.size, amount };
}

export interface ManagerStats extends CallSummary {
  name: string;
  band: CallScoreBand;
  /** enough rated calls to rank, praise or send to coaching */
  enough: boolean;
  lowCalls: number;
  deals: { count: number; amount: number };
  /** the deals behind this manager's "Срыв" calls */
  riskDeals: { count: number; amount: number };
}

/** The managers of the CRM team, best average first; managers without a rated call go last. */
export function managerStats(calls: Call[]): ManagerStats[] {
  const byName = new Map<string, Call[]>();
  for (const c of calls) {
    if (!hasCrmManager(c)) continue;
    const name = c.manager.trim();
    byName.set(name, [...(byName.get(name) ?? []), c]);
  }
  const rows: ManagerStats[] = [];
  byName.forEach((mine, name) => {
    const s = summarizeCalls(mine);
    const low = mine.filter((c) => isAssessed(c) && getCallScoreBand(c.score) === 'low');
    rows.push({
      ...s,
      name,
      band: getCallScoreBand(s.avgScore),
      enough: s.assessed >= MIN_RATED_CALLS,
      lowCalls: low.length,
      deals: dealsOf(mine),
      riskDeals: dealsOf(low),
    });
  });
  return rows.sort(
    (a, b) =>
      (b.avgScore ?? -1) - (a.avgScore ?? -1) || b.assessed - a.assessed || a.name.localeCompare(b.name, 'ru')
  );
}

export interface CriterionRate {
  index: number;
  pass: number;
  assessed: number;
  /** 0..1, or null when no call was assessed on this criterion */
  rate: number | null;
}

/** Pass rate of each of the 13 criteria over the calls where THIS criterion really got a 0 or a 1. */
export function criterionRates(calls: Call[]): CriterionRate[] {
  return Array.from({ length: 13 }, (_, index) => {
    let pass = 0;
    let assessed = 0;
    for (const c of calls) {
      if (!isAssessed(c)) continue;
      const v = c.cr?.[index];
      if (v === 1 || v === 0) {
        assessed += 1;
        if (v === 1) pass += 1;
      }
    }
    return { index, pass, assessed, rate: assessed > 0 ? pass / assessed : null };
  });
}

/** "1 звонок", "2 звонка", "5 звонков". */
export function ruPlural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

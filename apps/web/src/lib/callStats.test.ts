import { describe, it, expect } from 'vitest';
import { callKind, criterionRates, dealsOf, managerStats, ruPlural, summarizeCalls } from './callStats';
import { failedCall as failed, makeCall, missedCall as missed } from '@/test/callFactory';

const call = makeCall;

describe('callKind', () => {
  it('tells a missed call and a failed audit from a real call, with or without the kind field', () => {
    expect(callKind(call())).toBe('assessed');
    expect(callKind(missed())).toBe('unanswered');
    expect(callKind(failed())).toBe('audit_failed');
    expect(callKind(call({ kind: undefined, status: 'unanswered', score: null }))).toBe('unanswered');
    expect(callKind(call({ score: null, status: 'unknown' }))).toBe('unrated');
    expect(callKind(call({ score: 0, status: 'risk' }))).toBe('assessed'); // a real zero stays a zero
  });
});

describe('summarizeCalls', () => {
  it('averages only assessed calls', () => {
    const s = summarizeCalls([call({ score: 12 }), call({ score: 8 }), missed(), failed(), call({ score: null, status: 'unknown' })]);
    expect(s).toMatchObject({ total: 5, assessed: 2, unanswered: 1, failed: 1, unrated: 1, avgScore: 10 });
  });

  it('has no average and no Next Step rate without an assessed call', () => {
    expect(summarizeCalls([missed(), failed()])).toMatchObject({ avgScore: null, nextStepPct: null });
    expect(summarizeCalls([])).toMatchObject({ total: 0, avgScore: null });
  });

  it('counts Next Step over the calls where it is known', () => {
    const s = summarizeCalls([call({ next_step: 1 }), call({ next_step: 0 }), call({ next_step: null })]);
    expect(s).toMatchObject({ nextStepDone: 1, nextStepKnown: 2, nextStepPct: 50 });
  });

  it('keeps a real 0% as 0, not as "no data"', () => {
    expect(summarizeCalls([call({ next_step: 0 })]).nextStepPct).toBe(0);
  });
});

describe('dealsOf', () => {
  it('counts one deal once however many calls it has', () => {
    const calls = [
      call({ deal_id: '7', amount_num: 100 }),
      call({ deal_id: '7', amount_num: 100 }),
      call({ deal_id: '8', amount_num: 50 }),
      call({ deal_id: '', amount_num: 999 }),
    ];
    expect(dealsOf(calls)).toEqual({ count: 2, amount: 150 });
  });
});

describe('managerStats', () => {
  it('ranks only CRM managers: "Не определён" and "Неизвестен" are in no rating', () => {
    const rows = managerStats([call(), call({ manager: 'Не определён' }), call({ manager: 'Неизвестен' }), call({ manager: 'Не указан' })]);
    expect(rows.map((r) => r.name)).toEqual(['Кристина']);
  });

  it('a manager needs three rated calls to count; a missed call and a failure are not rated', () => {
    const two = managerStats([call(), call(), missed(), failed()])[0];
    expect(two).toMatchObject({ assessed: 2, enough: false, unanswered: 1, failed: 1 });
    const three = managerStats([call(), call(), call()])[0];
    expect(three.enough).toBe(true);
  });

  it('sorts by the average of rated calls, managers without any last', () => {
    const rows = managerStats([
      call({ manager: 'Без оценок', score: null, status: 'unknown' }),
      call({ manager: 'Слабый', score: 4 }),
      call({ manager: 'Сильный', score: 12 }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Сильный', 'Слабый', 'Без оценок']);
    expect(rows[2].avgScore).toBeNull();
  });

  it('counts the deals behind "Срыв" calls once', () => {
    const [m] = managerStats([
      call({ score: 2, deal_id: 'a', amount_num: 100 }),
      call({ score: 3, deal_id: 'a', amount_num: 100 }),
      call({ score: 12, deal_id: 'b', amount_num: 500 }),
    ]);
    expect(m.lowCalls).toBe(2);
    expect(m.riskDeals).toEqual({ count: 1, amount: 100 });
    expect(m.deals).toEqual({ count: 2, amount: 600 });
  });
});

describe('criterionRates', () => {
  it('divides by the calls where the criterion was assessed, and keeps 0% apart from "no data"', () => {
    const rates = criterionRates([
      call({ cr: [0, 1, ...Array(11).fill(null)] }),
      call({ cr: [0, 0, ...Array(11).fill(null)] }),
      missed(),
    ]);
    expect(rates[0]).toMatchObject({ pass: 0, assessed: 2, rate: 0 });
    expect(rates[1]).toMatchObject({ pass: 1, assessed: 2, rate: 0.5 });
    expect(rates[2]).toMatchObject({ assessed: 0, rate: null });
  });
});

describe('ruPlural', () => {
  it('declines the Russian way', () => {
    const f: [string, string, string] = ['звонок', 'звонка', 'звонков'];
    expect([1, 2, 4, 5, 11, 12, 21, 22, 25].map((n) => ruPlural(n, f))).toEqual([
      'звонок', 'звонка', 'звонка', 'звонков', 'звонков', 'звонков', 'звонок', 'звонка', 'звонков',
    ]);
  });
});

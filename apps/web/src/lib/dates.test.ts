import { describe, expect, it } from 'vitest';
import { addDaysToKey, businessDayKey, callDayKey, callHour, callInstant, monthInfo } from './dates';

describe('business day (Europe/Moscow)', () => {
  it('computes "today" in Moscow, not in UTC', () => {
    // 22:30 UTC on Nov 2nd is 01:30 on Nov 3rd in Moscow
    expect(businessDayKey(new Date('2026-11-02T22:30:00Z'))).toBe('2026-11-03');
    expect(businessDayKey(new Date('2026-11-02T20:59:00Z'))).toBe('2026-11-02');
  });

  it('"yesterday" at 02:00 Moscow is the previous Moscow day (toISOString gave two days back)', () => {
    const now = new Date('2026-11-02T23:00:00Z'); // 02:00 MSK, Nov 3rd
    expect(addDaysToKey(businessDayKey(now), -1)).toBe('2026-11-02');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDaysToKey('2026-11-01', -1)).toBe('2026-10-31');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(monthInfo('2026-02-10')).toEqual({ dayOfMonth: 10, daysInMonth: 28, month: '2026-02' });
  });
});

describe('call date strings', () => {
  it('reads API wall time as the same Moscow day', () => {
    expect(callDayKey('2026-11-03 01:30:00')).toBe('2026-11-03');
    expect(callHour('2026-11-03 01:30:00')).toBe(1);
  });

  it('converts an explicit-zone instant to the Moscow day', () => {
    expect(callDayKey('2026-11-02T22:30:00Z')).toBe('2026-11-03');
    expect(callHour('2026-11-02T22:30:00Z')).toBe(1);
  });

  it('reads DD.MM.YYYY as day.month (02.11.2026 is Nov 2nd, not Feb 11th)', () => {
    expect(callDayKey('02.11.2026 19:30')).toBe('2026-11-02');
    expect(callHour('02.11.2026 19:30')).toBe(19);
    expect(callDayKey('02.11.2026')).toBe('2026-11-02');
  });

  it('date-only values have no hour; garbage is null', () => {
    expect(callDayKey('2026-11-02')).toBe('2026-11-02');
    expect(callHour('2026-11-02')).toBeNull();
    expect(callDayKey('вчера')).toBeNull();
    expect(callInstant('')).toBeNull();
  });

  it('wall time is an instant in Moscow (UTC+3)', () => {
    expect(callInstant('2026-11-03 01:30:00')?.toISOString()).toBe('2026-11-02T22:30:00.000Z');
  });
});

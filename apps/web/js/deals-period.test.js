import { describe, it, expect, afterEach, vi } from 'vitest';

// Используем фиксированную "текущую дату" для стабильных тестов
const FIXED_NOW = new Date('2026-10-15T12:00:00Z');

describe('isItemInPeriod', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function getMod() {
    vi.stubGlobal('window', {});
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const raw = await import('./deals.js?t=' + Date.now());
    return raw.default || raw;
  }

  it('today: дата = сегодня → true', async () => {
    const mod = await getMod();
    expect(mod.isItemInPeriod('2026-10-15', 'today')).toBe(true);
  });

  it('today: дата = вчера → false', async () => {
    const mod = await getMod();
    expect(mod.isItemInPeriod('2026-10-14', 'today')).toBe(false);
  });

  it('7d: дата 3 дня назад → true', async () => {
    const mod = await getMod();
    expect(mod.isItemInPeriod('2026-10-12', '7d')).toBe(true);
  });

  it('7d: дата 10 дней назад → false', async () => {
    const mod = await getMod();
    expect(mod.isItemInPeriod('2026-10-05', '7d')).toBe(false);
  });

  it('month: дата в этом месяце → true', async () => {
    const mod = await getMod();
    expect(mod.isItemInPeriod('2026-10-01', 'month')).toBe(true);
  });

  it('month: дата в прошлом месяце → false', async () => {
    const mod = await getMod();
    expect(mod.isItemInPeriod('2026-09-15', 'month')).toBe(false);
  });

  it('year: дата в этом году → true', async () => {
    const mod = await getMod();
    expect(mod.isItemInPeriod('2026-01-15', 'year')).toBe(true);
  });

  it('year: дата в прошлом году → false', async () => {
    const mod = await getMod();
    expect(mod.isItemInPeriod('2025-12-31', 'year')).toBe(false);
  });

  it('пустая дата → true (не фильтруем)', async () => {
    const mod = await getMod();
    expect(mod.isItemInPeriod('', 'today')).toBe(true);
    expect(mod.isItemInPeriod(null, 'today')).toBe(true);
    expect(mod.isItemInPeriod(undefined, 'month')).toBe(true);
  });

  it('невалидная дата (мусор) → true (пропускаем, а не отбрасываем)', async () => {
    const mod = await getMod();
    expect(mod.isItemInPeriod('не-дата', 'today')).toBe(true);
    expect(mod.isItemInPeriod('abc123', 'month')).toBe(true);
  });

  it('дата в формате ISO с временем → работает корректно', async () => {
    const mod = await getMod();
    expect(mod.isItemInPeriod('2026-10-15T08:30:00', 'today')).toBe(true);
  });
});

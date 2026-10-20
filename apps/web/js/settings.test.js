import { describe, it, expect, afterEach, vi } from 'vitest';

describe('getMonthlyTarget', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('пустые настройки → дефолт 5 000 000', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { getElementById: () => null });
    const raw = await import('./settings.js?t=' + Date.now());
    const mod = raw.default || raw;
    // SYSTEM_SETTINGS = null в свежем модуле
    expect(mod.getMonthlyTarget()).toBe(5000000);
  });

  it('SYSTEM_SETTINGS = null → дефолт 5 000 000', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { getElementById: () => null });
    const raw = await import('./settings.js?t=' + Date.now());
    const mod = raw.default || raw;
    mod.SYSTEM_SETTINGS = null;
    expect(mod.getMonthlyTarget()).toBe(5000000);
  });

  it('SYSTEM_SETTINGS.general.monthly_target = 10 000 000 → возвращает 10M', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { getElementById: () => null });
    const raw = await import('./settings.js?t=' + Date.now());
    const mod = raw.default || raw;
    mod.SYSTEM_SETTINGS = { general: { monthly_target: 10000000 } };
    expect(mod.getMonthlyTarget()).toBe(10000000);
  });

  it('monthly_target = 0 → fallback на 5M (защита от деления на 0)', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { getElementById: () => null });
    const raw = await import('./settings.js?t=' + Date.now());
    const mod = raw.default || raw;
    mod.SYSTEM_SETTINGS = { general: { monthly_target: 0 } };
    expect(mod.getMonthlyTarget()).toBe(5000000);
  });

  it('monthly_target как строка "3000000" → возвращает число 3000000', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { getElementById: () => null });
    const raw = await import('./settings.js?t=' + Date.now());
    const mod = raw.default || raw;
    mod.SYSTEM_SETTINGS = { general: { monthly_target: '3000000' } };
    expect(mod.getMonthlyTarget()).toBe(3000000);
  });
});

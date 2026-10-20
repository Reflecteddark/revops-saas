import { describe, it, expect, afterEach, vi } from 'vitest';

describe('getDynamicRepMetrics', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('пустой CALLS_DATA → пустые массивы', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('CALLS_DATA', []);
    vi.stubGlobal('getCallAmount', (c) => c.amount_num || 0);
    const raw = await import('./charts.js?t=' + Date.now());
    const mod = raw.default || raw;
    const m = mod.getDynamicRepMetrics();
    expect(m.pipe.data).toEqual([]);
    expect(m.score.data).toEqual([]);
    expect(m.step.data).toEqual([]);
    expect(m.risk.data).toEqual([]);
  });

  it('один менеджер с 2 звонками → корректные суммы и средний балл', async () => {
    const calls = [
      { manager: 'Светлана', status: 'won', score: 12, next_step: 1, amount: 500000 },
      { manager: 'Светлана', status: 'risk', score: 6, next_step: 0, amount: 300000 }
    ];
    vi.stubGlobal('window', {});
    vi.stubGlobal('CALLS_DATA', calls);
    vi.stubGlobal('getCallAmount', (c) => c.amount);
    const raw = await import('./charts.js?t=' + Date.now());
    const mod = raw.default || raw;
    const m = mod.getDynamicRepMetrics();
    expect(m.pipe.data.length).toBe(1);
    expect(m.pipe.data[0]).toBe(800000);        // 500k + 300k
    expect(m.score.data[0]).toBe(9.0);          // (12+6)/2
    expect(m.step.data[0]).toBe(50);            // 1 из 2 с next_step
    expect(m.risk.data[0]).toBe(300000);        // только risk-звонок
  });

  it('два менеджера → две строки в каждом массиве', async () => {
    const calls = [
      { manager: 'Светлана', status: 'won', score: 12, next_step: 1, amount: 500000 },
      { manager: 'Надежда', status: 'won', score: 10, next_step: 1, amount: 400000 }
    ];
    vi.stubGlobal('window', {});
    vi.stubGlobal('CALLS_DATA', calls);
    vi.stubGlobal('getCallAmount', (c) => c.amount);
    const raw = await import('./charts.js?t=' + Date.now());
    const mod = raw.default || raw;
    const m = mod.getDynamicRepMetrics();
    expect(m.pipe.data.length).toBe(2);
    expect(m.score.data.length).toBe(2);
    expect(m.step.data.length).toBe(2);
  });

  it('все звонки risk → риск = полный пайплайн', async () => {
    const calls = [
      { manager: 'Светлана', status: 'risk', score: 5, next_step: 0, amount: 500000 },
      { manager: 'Светлана', status: 'risk', score: 6, next_step: 0, amount: 300000 }
    ];
    vi.stubGlobal('window', {});
    vi.stubGlobal('CALLS_DATA', calls);
    vi.stubGlobal('getCallAmount', (c) => c.amount);
    const raw = await import('./charts.js?t=' + Date.now());
    const mod = raw.default || raw;
    const m = mod.getDynamicRepMetrics();
    expect(m.risk.data[0]).toBe(800000);        // весь пайплайн в риске
    expect(m.step.data[0]).toBe(0);             // 0 из 2 с next_step
  });
});

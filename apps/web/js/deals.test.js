import { describe, it, expect } from 'vitest';
import { calculateFinancials } from './deals.js';

// getCallAmount из calls.js для fallback-сценария
globalThis.getCallAmount = (c) => (c && c.amount) ? c.amount : 300000;

describe('calculateFinancials', () => {
  it('пустые данные → все нули', () => {
    const r = calculateFinancials([], []);
    expect(r.totalFact).toBe(0);
    expect(r.computedPipeline).toBe(0);
    expect(r.computedSsot).toBe(0);
    expect(r.activeDealsCount).toBe(0);
  });

  it('won сделка → fact = ssot = сумма', () => {
    const r = calculateFinancials([{ amount: 500000, stage_id: 6, status: 'won' }], []);
    expect(r.totalFact).toBe(500000);
    expect(r.computedSsot).toBe(500000);
    expect(r.computedPipeline).toBe(0);
    expect(r.activeDealsCount).toBe(0);
  });

  it('стадия 1 → SSOT = 10% от суммы', () => {
    const r = calculateFinancials([{ amount: 1000000, stage_id: 1 }], []);
    expect(r.computedPipeline).toBe(1000000);
    expect(r.computedSsot).toBe(100000);
    expect(r.activeDealsCount).toBe(1);
  });

  it('стадия 3 → SSOT = 25%', () => {
    const r = calculateFinancials([{ amount: 1000000, stage_id: 3 }], []);
    expect(r.computedSsot).toBe(250000);
  });

  it('стадия 5 → SSOT = 50%', () => {
    const r = calculateFinancials([{ amount: 1000000, stage_id: 5 }], []);
    expect(r.computedSsot).toBe(500000);
  });

  it('стадия 7 (невалидная) → игнорируется', () => {
    const r = calculateFinancials([{ amount: 1000000, stage_id: 7 }], []);
    expect(r.totalFact).toBe(0);
    expect(r.computedPipeline).toBe(0);
    expect(r.computedSsot).toBe(0);
  });

  it('won + pipeline смешанные → корректная сумма', () => {
    const deals = [
      { amount: 500000, stage_id: 6 },
      { amount: 400000, stage_id: 3 }
    ];
    const r = calculateFinancials(deals, []);
    expect(r.totalFact).toBe(500000);
    expect(r.computedPipeline).toBe(400000);
    expect(r.computedSsot).toBe(600000);
    expect(r.activeDealsCount).toBe(1);
  });

  it('fallback на calls если deals пустой', () => {
    const calls = [
      { amount: 300000, status: 'won', score: 12, next_step: 1 },
      { amount: 300000, status: 'norm', score: 9, next_step: 1 }
    ];
    const r = calculateFinancials([], calls);
    expect(r.totalFact).toBe(300000);
    expect(r.computedPipeline).toBeGreaterThan(0);
  });
});

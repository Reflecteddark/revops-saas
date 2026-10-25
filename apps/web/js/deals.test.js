import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateFinancials, renderYesterdayLeaks } from './deals.js';

// getCallAmount из calls.js для fallback-сценария
globalThis.getCallAmount = (c) => {
  if (!c) return 0;
  if (typeof c.amount_num === 'number') return c.amount_num;
  if (typeof c.amount === 'number') return c.amount;
  if (c.amount) {
    const parsed = parseInt(String(c.amount).replace(/\D/g, ''), 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
};
globalThis.escapeHtml = (s) => String(s || '');

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

  it('honest zero-state если deals пустой (calls не используются как fallback)', () => {
    const calls = [
      { amount: 300000, status: 'won', score: 12, next_step: 1 },
      { amount: 300000, status: 'norm', score: 9, next_step: 1 }
    ];
    const r = calculateFinancials([], calls);
    expect(r.totalFact).toBe(0);
    expect(r.computedPipeline).toBe(0);
    expect(r.computedSsot).toBe(0);
    expect(r.activeDealsCount).toBe(0);
    expect(window._DEALS_DATA_UNAVAILABLE).toBe(true);
  });
});

describe('renderYesterdayLeaks', () => {
  let mockContainer;
  let mockBadge;

  beforeEach(() => {
    mockContainer = { innerHTML: '' };
    mockBadge = { textContent: '', className: '', innerHTML: '' };

    vi.stubGlobal('document', {
      getElementById: (id) => {
        if (id === 'yesterdayLeaksList') return mockContainer;
        if (id === 'yesterdayLeaksBadge') return mockBadge;
        return null;
      }
    });
  });

  it('пустой CALLS_DATA → отображает Empty State с поздравлением', () => {
    vi.stubGlobal('CALLS_DATA', []);
    renderYesterdayLeaks();

    expect(mockContainer.innerHTML).toContain('Вчера сливов не было. Хорошая работа!');
    expect(mockContainer.innerHTML).toContain('check-circle');
    expect(mockBadge.className).toContain('pill-pos');
  });

  it('фильтрует звонки со статусом risk за вчера и сортирует по убыванию суммы', () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 15, 30).toISOString();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0).toISOString();
    const twoDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 10, 0).toISOString();

    vi.stubGlobal('CALLS_DATA', [
      { id: 'c1', manager: 'Иван Менеджер', client: 'ООО Альфа', amount_num: 500000, amount: '500 000 ₽', status: 'risk', date: yesterday, next_step: 0 },
      { id: 'c2', manager: 'Светлана К.', client: 'ИП Бета', amount_num: 1500000, amount: '1 500 000 ₽', status: 'risk', date: yesterday, next_step: 0 },
      { id: 'c3', manager: 'Петр', client: 'ООО Гамма', amount_num: 2000000, amount: '2 000 000 ₽', status: 'won', date: yesterday, next_step: 1 }, // Won -> не слив
      { id: 'c4', manager: 'Иван Менеджер', client: 'ООО Дельта', amount_num: 800000, amount: '800 000 ₽', status: 'risk', date: today, next_step: 0 }, // Сегодня -> не вчера
      { id: 'c5', manager: 'Иван Менеджер', client: 'ООО Омега', amount_num: 900000, amount: '900 000 ₽', status: 'risk', date: twoDaysAgo, next_step: 0 } // Позавчера -> не вчера
    ]);

    renderYesterdayLeaks();

    // Должны отображаться 2 вчерашних сбоя (c2 и c1), при этом c2 (1.5M) выше c1 (500k)
    expect(mockContainer.innerHTML).toContain('ИП Бета');
    expect(mockContainer.innerHTML).toContain('ООО Альфа');
    expect(mockContainer.innerHTML).not.toContain('ООО Гамма');
    expect(mockContainer.innerHTML).not.toContain('ООО Дельта');

    const idxC2 = mockContainer.innerHTML.indexOf('1 500 000 ₽');
    const idxC1 = mockContainer.innerHTML.indexOf('500 000 ₽');
    expect(idxC2).toBeLessThan(idxC1); // c2 выше c1

    // Проверяем счётчик бейджа: 2 сделки · 2.0M ₽
    expect(mockBadge.textContent).toContain('2 сделки · 2M ₽');
    expect(mockBadge.className).toContain('pill-neg');
  });

  it('ограничивает вывод первыми 5 сделками при большем количестве сливов', () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 14, 0).toISOString();

    const manyCalls = [
      { id: 'c1', manager: 'М1', client: 'Клиент 1', amount_num: 100000, amount: '100 000 ₽', status: 'risk', date: yesterday, next_step: 0 },
      { id: 'c2', manager: 'М2', client: 'Клиент 2', amount_num: 200000, amount: '200 000 ₽', status: 'risk', date: yesterday, next_step: 0 },
      { id: 'c3', manager: 'М3', client: 'Клиент 3', amount_num: 300000, amount: '300 000 ₽', status: 'risk', date: yesterday, next_step: 0 },
      { id: 'c4', manager: 'М4', client: 'Клиент 4', amount_num: 400000, amount: '400 000 ₽', status: 'risk', date: yesterday, next_step: 0 },
      { id: 'c5', manager: 'М5', client: 'Клиент 5', amount_num: 500000, amount: '500 000 ₽', status: 'risk', date: yesterday, next_step: 0 },
      { id: 'c6', manager: 'М6', client: 'Клиент 6', amount_num: 600000, amount: '600 000 ₽', status: 'risk', date: yesterday, next_step: 0 },
      { id: 'c7', manager: 'М7', client: 'Клиент 7', amount_num: 50000, amount: '50 000 ₽', status: 'risk', date: yesterday, next_step: 0 }
    ];

    vi.stubGlobal('CALLS_DATA', manyCalls);
    renderYesterdayLeaks();

    // Должно быть 5 верхних: 600k, 500k, 400k, 300k, 200k
    expect(mockContainer.innerHTML).toContain('Клиент 6');
    expect(mockContainer.innerHTML).toContain('Клиент 5');
    expect(mockContainer.innerHTML).toContain('Клиент 4');
    expect(mockContainer.innerHTML).toContain('Клиент 3');
    expect(mockContainer.innerHTML).toContain('Клиент 2');
    // Не должно быть Клиент 1 (100k) и Клиент 7 (50k) в топ-5
    expect(mockContainer.innerHTML).not.toContain('Клиент 7');
    expect(mockContainer.innerHTML).not.toContain('Клиент 1');

    // Но общий счётчик в бейдже должен учитывать все 7 сделок
    expect(mockBadge.textContent).toContain('7 сделок');
  });
});


import { describe, it, expect, beforeEach, vi } from 'vitest';
import { filterCallsTable } from './calls.js';

beforeEach(() => {
  const elements = {
    filterManager: { value: 'all' },
    filterStatus: { value: 'all' },
    transcriptSearch: { value: '' },
    callsListContainer: { innerHTML: '', appendChild: () => {} },
    searchResultBadge: { textContent: '', className: '' },
    agRowsCount: { textContent: '' },
    callsListSummary: { innerHTML: '' },
    pulseRecentCallsCount: { textContent: '' },
    lblRecentCallsFilter: { textContent: 'Все' },
    syncStatusBadge: { textContent: '' },
    modalCriteriaPills: { innerHTML: '', appendChild: () => {} }
  };

  vi.stubGlobal('document', {
    getElementById: (id) => elements[id] || null,
    createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
    querySelector: () => null,
    querySelectorAll: () => []
  });

  vi.stubGlobal('CALLS_DATA', [
    { id: '1', manager: 'Светлана', status: 'risk', score: 5, transcript: 'клиент сказал дорого', deal_title: 'Тест 1', client: 'А', amount: '500k', duration: '1:00', stage: 'КП', error_summary: '', recommendation: '', cr: Array(13).fill(0), next_step: 0 },
    { id: '2', manager: 'Светлана', status: 'won', score: 12, transcript: 'успех', deal_title: 'Тест 2', client: 'Б', amount: '1M', duration: '2:00', stage: 'Оплата', error_summary: '', recommendation: '', cr: Array(13).fill(1), next_step: 1 }
  ]);

  vi.stubGlobal('escapeHtml', (s) => String(s || ''));
  vi.stubGlobal('updateCallsPills', () => {});
});

describe('filterCallsTable', () => {
  it('пустой массив звонков → не падает', () => {
    vi.stubGlobal('CALLS_DATA', []);
    expect(() => filterCallsTable()).not.toThrow();
  });

  it('фильтр "all" → не падает', () => {
    expect(() => filterCallsTable()).not.toThrow();
  });

  it('фильтр по менеджеру → не падает', () => {
    const el = document.getElementById('filterManager');
    if (el) el.value = 'Светлана';
    expect(() => filterCallsTable()).not.toThrow();
  });

  it('фильтр по статусу risk → не падает', () => {
    const el = document.getElementById('filterStatus');
    if (el) el.value = 'risk';
    expect(() => filterCallsTable()).not.toThrow();
  });

  it('поиск по тексту → не падает', () => {
    const el = document.getElementById('transcriptSearch');
    if (el) el.value = 'скидка';
    expect(() => filterCallsTable()).not.toThrow();
  });
});

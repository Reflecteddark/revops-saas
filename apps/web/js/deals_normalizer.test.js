import { describe, it, expect } from 'vitest';
import {
  parseNumericPrice,
  sanitizeCustomPayload,
  mapStageBitrix24,
  mapStageAmoCRM,
  normalizeBitrix24Deal,
  normalizeAmoCRMDeal,
  normalizeDeal,
  processN8nDealItems,
  MAX_SHEET_CELL_CHARS
} from './deals_normalizer.js';

describe('1. parseNumericPrice', () => {
  it('correctly handles zero and zero-strings without mock fallbacks', () => {
    expect(parseNumericPrice(0)).toEqual([0, false]);
    expect(parseNumericPrice('0')).toEqual([0, false]);
    expect(parseNumericPrice('0.00')).toEqual([0, false]);
    expect(parseNumericPrice('0,00')).toEqual([0, false]);
  });

  it('correctly handles missing/empty values', () => {
    expect(parseNumericPrice(null)).toEqual([0, true]);
    expect(parseNumericPrice(undefined)).toEqual([0, true]);
    expect(parseNumericPrice('')).toEqual([0, true]);
  });

  it('correctly parses formatted currency strings', () => {
    expect(parseNumericPrice('150 000 ₽')).toEqual([150000, false]);
    expect(parseNumericPrice('1,250,000.50')).toEqual([1250000.5, false]);
    expect(parseNumericPrice('250.000,50 ₽')).toEqual([250000.5, false]);
  });
});

describe('2. sanitizeCustomPayload (Cell Safety < 45,000 chars)', () => {
  it('serializes normal payload cleanly', () => {
    const payload = { UF_CRM_TEST: 'value1', UF_CRM_LEAD: 123 };
    const serialized = sanitizeCustomPayload(payload);
    expect(JSON.parse(serialized)).toEqual(payload);
    expect(serialized.length).toBeLessThan(MAX_SHEET_CELL_CHARS);
  });

  it('truncates oversized payload beyond 45,000 characters safely', () => {
    const giantPayload = {
      data: 'x'.repeat(60000)
    };
    const serialized = sanitizeCustomPayload(giantPayload);
    expect(serialized.length).toBeLessThanOrEqual(MAX_SHEET_CELL_CHARS);
    expect(serialized).toContain('"_truncated":true}');
  });
});

describe('3. Stage Mapping & NaN Protection', () => {
  it('Bitrix24: maps WON, LOST, and standard stages', () => {
    expect(mapStageBitrix24('WON').status).toBe('WON');
    expect(mapStageBitrix24('WON').weight).toBe(1.0);
    expect(mapStageBitrix24('LOSE').status).toBe('LOST');
    expect(mapStageBitrix24('LOSE').weight).toBe(0.0);
    expect(mapStageBitrix24('PREPARATION').stageNum).toBe(2);
    expect(mapStageBitrix24('PREPARATION').weight).toBe(0.35);
  });

  it('Bitrix24: unmapped stage returns status UNKNOWN and weight null (zero NaN risk)', () => {
    const res = mapStageBitrix24('C1:CUSTOM_UNMAPPED_XYZ');
    expect(res.status).toBe('UNKNOWN');
    expect(res.stageNum).toBeNull();
    expect(res.weight).toBeNull();
    expect(Number.isNaN(res.weight)).toBe(false);
  });

  it('amoCRM: maps 142 (WON), 143 (LOST), and dynamic catalog', () => {
    expect(mapStageAmoCRM('1', '142').status).toBe('WON');
    expect(mapStageAmoCRM('1', '143').status).toBe('LOST');

    const stagesCatalog = {
      '1:200': { name: 'Подписание договора', sort: 40 }
    };
    const mapped = mapStageAmoCRM('1', '200', null, stagesCatalog);
    expect(mapped.stageNum).toBe(4);
    expect(mapped.stageName).toBe('Подписание договора');
    expect(mapped.weight).toBe(0.85);
  });

  it('amoCRM: unmapped status returns status UNKNOWN and weight null', () => {
    const res = mapStageAmoCRM('1', '999999');
    expect(res.status).toBe('UNKNOWN');
    expect(res.stageNum).toBeNull();
    expect(res.weight).toBeNull();
  });
});

describe('4. normalizeBitrix24Deal', () => {
  it('enforces B24- prefix and never defaults to 300000', () => {
    const raw = {
      ID: '1050',
      TITLE: 'Поставка станков',
      OPPORTUNITY: '0',
      STAGE_ID: 'NEW'
    };
    const norm = normalizeBitrix24Deal(raw, 'TNT-001');
    expect(norm.deal_id).toBe('B24-1050');
    expect(norm.amount).toBe(0);
    expect(norm.amount_str).toBe('0 ₽');
    expect(norm.company_name).toBe('Поставка станков');
    expect(norm.stage_name).toBe('Новая');
    expect(norm.status).toBe('ACTIVE');
    expect(norm.weighted_amount).toBe(0);
  });

  it('handles unknown stage with strict NaN-protected weighted_amount (null, not NaN)', () => {
    const raw = {
      ID: '1051',
      OPPORTUNITY: 500000,
      STAGE_ID: 'C99:WEIRD_CUSTOM_STAGE'
    };
    const norm = normalizeBitrix24Deal(raw, 'TNT-001');
    expect(norm.deal_id).toBe('B24-1051');
    expect(norm.amount).toBe(500000);
    expect(norm.weighted_amount).toBeNull();
    expect(norm.weighted_amount_str).toBe('—');
    expect(norm.status).toBe('UNKNOWN');
  });

  it('handles soft-delete correctly', () => {
    const raw = {
      ID: '1052',
      is_deleted: true
    };
    const norm = normalizeBitrix24Deal(raw, 'TNT-001');
    expect(norm.status).toBe('DELETED');
    expect(norm.is_deleted).toBe('1');
    expect(norm.is_lost).toBe('1');
    expect(norm.is_active).toBe('0');
    expect(norm.lost_reason).toBe('Удалена в CRM');
  });
});

describe('5. normalizeAmoCRMDeal', () => {
  it('enforces AMO- prefix and never defaults to 300000', () => {
    const raw = {
      id: 99401,
      name: 'Разработка мобильного приложения',
      price: 0,
      status_id: 142
    };
    const norm = normalizeAmoCRMDeal(raw, 'TNT-001');
    expect(norm.deal_id).toBe('AMO-99401');
    expect(norm.amount).toBe(0);
    expect(norm.amount_str).toBe('0 ₽');
    expect(norm.company_name).toBe('Разработка мобильного приложения');
    expect(norm.stage_name).toBe('Успешно реализовано');
    expect(norm.status).toBe('WON');
    expect(norm.is_won).toBe('1');
  });

  it('handles custom UTM fields in custom_fields_values', () => {
    const raw = {
      id: 99402,
      price: 450000,
      custom_fields_values: [
        { field_code: 'UTM_SOURCE', values: [{ value: 'yandex_direct' }] },
        { field_code: 'UTM_CAMPAIGN', values: [{ value: 'b2b_promo_2026' }] }
      ]
    };
    const norm = normalizeAmoCRMDeal(raw, 'TNT-001');
    expect(norm.deal_id).toBe('AMO-99402');
    expect(norm.utm_source).toBe('yandex_direct');
    expect(norm.utm_campaign).toBe('b2b_promo_2026');
  });
});

describe('6. processN8nDealItems', () => {
  it('processes Bitrix24 nested data.FIELDS webhook correctly', () => {
    const n8nItems = [
      {
        json: {
          event: 'ONCRMDEALUPDATE',
          data: {
            FIELDS: {
              ID: '7788',
              TITLE: 'Спецпроект',
              OPPORTUNITY: '180000',
              STAGE_ID: 'PREPAYMENT'
            }
          }
        }
      }
    ];
    const results = processN8nDealItems(n8nItems, { tenantId: 'TNT-001' });
    expect(results).toHaveLength(1);
    expect(results[0].json.deal_id).toBe('B24-7788');
    expect(results[0].json.amount).toBe(180000);
    expect(results[0].json.stage_name).toBe('Счёт на предоплату');
  });

  it('processes Bitrix24 ONCRMDEALDELETE event as soft-deleted deal', () => {
    const n8nItems = [
      {
        json: {
          event: 'ONCRMDEALDELETE',
          data: {
            FIELDS: {
              ID: '7789'
            }
          }
        }
      }
    ];
    const results = processN8nDealItems(n8nItems, { tenantId: 'TNT-001' });
    expect(results).toHaveLength(1);
    expect(results[0].json.deal_id).toBe('B24-7789');
    expect(results[0].json.status).toBe('DELETED');
    expect(results[0].json.is_lost).toBe('1');
    expect(results[0].json.lost_reason).toBe('Удалена в CRM');
  });

  it('processes amoCRM webhook leads array (add, status, delete)', () => {
    const n8nItems = [
      {
        json: {
          leads: {
            add: [{ id: 501, name: 'Lead 501', price: 200000 }],
            status: [{ id: 502, name: 'Lead 502', status_id: 142 }],
            delete: [{ id: 503 }]
          }
        }
      }
    ];
    const results = processN8nDealItems(n8nItems, { tenantId: 'TNT-002' });
    expect(results).toHaveLength(3);
    const ids = results.map(r => r.json.deal_id);
    expect(ids).toEqual(['AMO-503', 'AMO-501', 'AMO-502']);
    const del = results.find(r => r.json.deal_id === 'AMO-503');
    expect(del.json.status).toBe('DELETED');
    const won = results.find(r => r.json.deal_id === 'AMO-502');
    expect(won.json.status).toBe('WON');
  });
});

/**
 * RevOps Enterprise OS - Universal Deal Normalizer (JavaScript / n8n / Web).
 * Normalizes multi-CRM payloads (Bitrix24 & amoCRM) into standard raw_deals schema.
 */

export const DEFAULT_STAGE_WEIGHTS = {
  1: 0.10, // Новый лид
  2: 0.35, // Квалификация
  3: 0.60, // Встреча / Демо
  4: 0.85, // В работе / КП
  5: 0.95, // Финальный счёт
  6: 1.00, // Успешно реализовано (WON)
  7: 0.00  // Закрыто и не реализовано (LOST)
};

export const DEFAULT_STAGE_NAMES = {
  1: "Новый лид",
  2: "Квалификация",
  3: "Встреча / Демо",
  4: "КП / В работе",
  5: "Финальный счёт / Договор",
  6: "Успешно реализовано",
  7: "Закрыто и не реализовано"
};

export const MAX_SHEET_CELL_CHARS = 45000;

/**
 * Parses numeric price from raw value without falsy defaults or hardcoded mocks.
 * Returns [price: number, isUnknown: boolean].
 */
export function parseNumericPrice(val) {
  if (val === null || val === undefined || val === '') {
    return [0.0, true];
  }
  if (typeof val === 'number') {
    return [Number.isFinite(val) ? val : 0.0, false];
  }

  let clean = String(val).trim().replace(/[^\d.,]/g, '');
  if (!clean) {
    return [0.0, true];
  }

  if (clean.includes(',') && clean.includes('.')) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    if (/,\d{3}$/.test(clean) || (clean.match(/,/g) || []).length > 1) {
      clean = clean.replace(/,/g, '');
    } else {
      clean = clean.replace(',', '.');
    }
  } else if (clean.includes('.')) {
    if (/\.\d{3}$/.test(clean) || (clean.match(/\./g) || []).length > 1) {
      clean = clean.replace(/\./g, '');
    }
  }

  const parsed = parseFloat(clean);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return [0.0, true];
  }
  return [parsed, false];
}

/**
 * Serializes custom payload to JSON string with strict < 45,000 character limit.
 */
export function sanitizeCustomPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return '{}';
  }
  try {
    const raw = JSON.stringify(payload);
    if (raw.length > MAX_SHEET_CELL_CHARS) {
      const truncated = raw.slice(0, MAX_SHEET_CELL_CHARS - 30);
      return truncated + '..."_truncated":true}';
    }
    return raw;
  } catch {
    return '{}';
  }
}

/**
 * Normalizes Bitrix24 stage into standard 1..7.
 */
export function mapStageBitrix24(rawStageId, rawSemantic, mappingConfig = null, stagesCatalog = null) {
  const cleanStage = String(rawStageId || '').trim().toUpperCase();
  const semantic = String(rawSemantic || '').trim().toUpperCase();

  if (mappingConfig && mappingConfig[cleanStage]) {
    const cfg = mappingConfig[cleanStage];
    const stNum = parseInt(cfg.stage_id ?? 1, 10);
    const weight = cfg.weight !== undefined && cfg.weight !== null ? Number(cfg.weight) : (DEFAULT_STAGE_WEIGHTS[stNum] ?? 0.1);
    const isWon = Boolean(stNum === 6 || cfg.is_won);
    const isLost = Boolean(stNum === 7 || cfg.is_lost);
    const isActive = Boolean(stNum >= 1 && stNum <= 5);
    const status = isWon ? 'WON' : (isLost ? 'LOST' : 'ACTIVE');
    return {
      stageNum: stNum,
      stageName: cfg.stage_name || DEFAULT_STAGE_NAMES[stNum] || cleanStage,
      weight,
      isWon,
      isLost,
      isActive,
      status
    };
  }

  if (semantic === 'S' || cleanStage.includes('WON') || cleanStage.includes('УСПЕШНО')) {
    return {
      stageNum: 6,
      stageName: 'Успешно реализовано',
      weight: 1.0,
      isWon: true,
      isLost: false,
      isActive: false,
      status: 'WON'
    };
  }

  if (semantic === 'F' || cleanStage.includes('LOSE') || cleanStage.includes('LOST') || cleanStage.includes('ПРОВАЛ') || cleanStage.includes('ОТКАЗ')) {
    return {
      stageNum: 7,
      stageName: 'Закрыто и не реализовано',
      weight: 0.0,
      isWon: false,
      isLost: true,
      isActive: false,
      status: 'LOST'
    };
  }

  if (cleanStage.includes('NEW') || cleanStage.includes('НОВАЯ') || cleanStage === '1' || cleanStage === 'STAGE_1') {
    return { stageNum: 1, stageName: 'Новая', weight: 0.10, isWon: false, isLost: false, isActive: true, status: 'ACTIVE' };
  }
  if (cleanStage.includes('PREPARATION') || cleanStage.includes('ДОКУМЕНТ') || cleanStage === '2' || cleanStage === 'STAGE_2') {
    return { stageNum: 2, stageName: 'Подготовка документов', weight: 0.35, isWon: false, isLost: false, isActive: true, status: 'ACTIVE' };
  }
  if (cleanStage.includes('PREPAYMENT') || cleanStage.includes('ПРЕДОПЛАТ') || cleanStage === '3' || cleanStage === 'STAGE_3') {
    return { stageNum: 3, stageName: 'Счёт на предоплату', weight: 0.60, isWon: false, isLost: false, isActive: true, status: 'ACTIVE' };
  }
  if (cleanStage.includes('EXECUTING') || cleanStage.includes('РАБОТ') || cleanStage === '4' || cleanStage === 'STAGE_4') {
    return { stageNum: 4, stageName: 'В работе', weight: 0.85, isWon: false, isLost: false, isActive: true, status: 'ACTIVE' };
  }
  if (cleanStage.includes('FINAL') || cleanStage.includes('ФИНАЛЬН') || cleanStage === '5' || cleanStage === 'STAGE_5') {
    return { stageNum: 5, stageName: 'Финальный счёт', weight: 0.95, isWon: false, isLost: false, isActive: true, status: 'ACTIVE' };
  }

  const catalogName = (stagesCatalog && stagesCatalog[cleanStage]) || `Неизвестный этап (${cleanStage})`;
  return {
    stageNum: null,
    stageName: catalogName,
    weight: null, // Strict null to prevent NaN in multiplication
    isWon: false,
    isLost: false,
    isActive: false,
    status: 'UNKNOWN'
  };
}

/**
 * Normalizes amoCRM status into standard 1..7.
 */
export function mapStageAmoCRM(pipelineId, statusId, mappingConfig = null, stagesCatalog = null) {
  const pipeStr = String(pipelineId || '').trim();
  const statusStr = String(statusId || '').trim();
  const key = pipeStr ? `${pipeStr}:${statusStr}` : statusStr;

  if (mappingConfig && (mappingConfig[key] || mappingConfig[statusStr])) {
    const cfg = mappingConfig[key] || mappingConfig[statusStr];
    const stNum = parseInt(cfg.stage_id ?? 1, 10);
    const weight = cfg.weight !== undefined && cfg.weight !== null ? Number(cfg.weight) : (DEFAULT_STAGE_WEIGHTS[stNum] ?? 0.1);
    const isWon = Boolean(stNum === 6 || cfg.is_won);
    const isLost = Boolean(stNum === 7 || cfg.is_lost);
    const isActive = Boolean(stNum >= 1 && stNum <= 5);
    const status = isWon ? 'WON' : (isLost ? 'LOST' : 'ACTIVE');
    return {
      stageNum: stNum,
      stageName: cfg.stage_name || DEFAULT_STAGE_NAMES[stNum] || `amoCRM Status ${statusStr}`,
      weight,
      isWon,
      isLost,
      isActive,
      status
    };
  }

  if (stagesCatalog && (stagesCatalog[key] || stagesCatalog[statusStr])) {
    const cat = stagesCatalog[key] || stagesCatalog[statusStr];
    const isWon = Boolean(cat.is_won || statusStr === '142');
    const isLost = Boolean(cat.is_lost || statusStr === '143');
    if (isWon) return { stageNum: 6, stageName: 'Успешно реализовано', weight: 1.0, isWon: true, isLost: false, isActive: false, status: 'WON' };
    if (isLost) return { stageNum: 7, stageName: 'Закрыто и не реализовано', weight: 0.0, isWon: false, isLost: true, isActive: false, status: 'LOST' };
    const sort = Math.floor(parseInt(cat.sort || 10, 10) / 10);
    const revStage = Math.max(1, Math.min(5, sort));
    return {
      stageNum: revStage,
      stageName: cat.name || `Статус ${statusStr}`,
      weight: DEFAULT_STAGE_WEIGHTS[revStage] ?? 0.1,
      isWon: false,
      isLost: false,
      isActive: true,
      status: 'ACTIVE'
    };
  }

  if (statusStr === '142') {
    return { stageNum: 6, stageName: 'Успешно реализовано', weight: 1.0, isWon: true, isLost: false, isActive: false, status: 'WON' };
  }
  if (statusStr === '143') {
    return { stageNum: 7, stageName: 'Закрыто и не реализовано', weight: 0.0, isWon: false, isLost: true, isActive: false, status: 'LOST' };
  }

  return {
    stageNum: null,
    stageName: `Неизвестный этап (amo #${statusStr})`,
    weight: null,
    isWon: false,
    isLost: false,
    isActive: false,
    status: 'UNKNOWN'
  };
}

/**
 * Normalizes a Bitrix24 deal dictionary into standard schema.
 */
export function normalizeBitrix24Deal(rawDeal, tenantId = 'TNT-001', options = {}) {
  const d = rawDeal.FIELDS || rawDeal.fields || rawDeal;
  const rawId = String(d.ID || d.id || '').trim();
  if (!rawId) {
    throw new Error('Missing deal ID in Bitrix24 payload');
  }

  const dealId = rawId.startsWith('B24-') ? rawId : `B24-${rawId}`;
  const title = String(d.TITLE || d.title || `Сделка #${rawId}`).trim();

  const rawPrice = d.OPPORTUNITY ?? d.opportunity ?? d.amount ?? d.price;
  const [amount, isPriceUnknown] = parseNumericPrice(rawPrice);

  const stageInfo = mapStageBitrix24(
    d.STAGE_ID || d.stage_id,
    d.STAGE_SEMANTIC_ID || d.stage_semantic_id,
    options.mappingConfig,
    options.stagesCatalog
  );

  let weightedAmount = null;
  if (stageInfo.weight !== null && stageInfo.weight !== undefined && !Number.isNaN(stageInfo.weight)) {
    weightedAmount = Math.round(amount * stageInfo.weight * 100) / 100;
  }

  const assignedById = String(d.ASSIGNED_BY_ID || d.assigned_by_id || '').trim();
  let managerName = 'Не назначен';
  let responsibleUser = null;
  if (assignedById && options.usersCatalog && options.usersCatalog[assignedById]) {
    managerName = String(options.usersCatalog[assignedById]);
    responsibleUser = assignedById;
  } else if (assignedById) {
    responsibleUser = assignedById;
    managerName = `Менеджер #${assignedById}`;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();
  const createdAt = String(d.DATE_CREATE || d.date_create || todayStr).slice(0, 10);
  const updatedAt = String(d.DATE_MODIFY || d.date_modify || todayStr).slice(0, 10);

  const customFields = {};
  for (const [k, v] of Object.entries(d)) {
    if (k.toLowerCase().startsWith('uf_crm_')) {
      customFields[k] = v;
    }
  }

  const customPayloadStr = sanitizeCustomPayload(customFields);
  const isDeleted = Boolean(d.is_deleted || stageInfo.status === 'DELETED');
  const deletedAt = isDeleted ? (d.deleted_at || nowIso) : null;

  return {
    deal_id: dealId,
    company_name: title,
    amount,
    amount_str: `${Math.round(amount).toLocaleString('ru-RU')} ₽`,
    price_is_unknown: isPriceUnknown,
    stage_id: stageInfo.stageNum !== null ? String(stageInfo.stageNum) : '0',
    stage_name: stageInfo.stageName,
    created_at: createdAt,
    updated_at: updatedAt,
    responsible_user: responsibleUser,
    manager_name: managerName,
    segment: 'General B2B',
    source: 'Bitrix24',
    client_id: rawId.replace('B24-', ''),
    client_grade: amount >= 300000 ? 'A' : (amount >= 150000 ? 'B' : 'C'),
    lost_reason: stageInfo.isLost ? 'Отказ' : (isDeleted ? 'Удалена в CRM' : ''),
    last_stage_change: updatedAt,
    is_won: stageInfo.isWon ? '1' : '0',
    is_lost: stageInfo.isLost || isDeleted ? '1' : '0',
    is_active: stageInfo.isActive && !isDeleted ? '1' : '0',
    weighted_amount: weightedAmount,
    weighted_amount_str: weightedAmount !== null ? `${Math.round(weightedAmount).toLocaleString('ru-RU')} ₽` : '—',
    status: isDeleted ? 'DELETED' : stageInfo.status,
    is_deleted: isDeleted ? '1' : '0',
    deleted_at: deletedAt,
    custom_payload: customPayloadStr,
    utm_source: String(d.UTM_SOURCE || ''),
    utm_medium: String(d.UTM_MEDIUM || ''),
    utm_campaign: String(d.UTM_CAMPAIGN || ''),
    channel: 'bitrix24',
    synced_at: nowIso,
    tenant_id: tenantId,
    spreadsheet_id: options.spreadsheetId || ''
  };
}

/**
 * Normalizes an amoCRM lead dictionary into standard schema.
 */
export function normalizeAmoCRMDeal(rawDeal, tenantId = 'TNT-001', options = {}) {
  const rawId = String(rawDeal.id || rawDeal.ID || '').trim();
  if (!rawId) {
    throw new Error('Missing deal ID in amoCRM payload');
  }

  const dealId = rawId.startsWith('AMO-') ? rawId : `AMO-${rawId}`;
  const title = String(rawDeal.name || rawDeal.title || `Сделка #${rawId}`).trim();

  const rawPrice = rawDeal.price ?? rawDeal.amount ?? rawDeal.opportunity;
  const [amount, isPriceUnknown] = parseNumericPrice(rawPrice);

  const stageInfo = mapStageAmoCRM(
    rawDeal.pipeline_id,
    rawDeal.status_id,
    options.mappingConfig,
    options.stagesCatalog
  );

  let weightedAmount = null;
  if (stageInfo.weight !== null && stageInfo.weight !== undefined && !Number.isNaN(stageInfo.weight)) {
    weightedAmount = Math.round(amount * stageInfo.weight * 100) / 100;
  }

  const respUserId = String(rawDeal.responsible_user_id || rawDeal.responsible_user || '').trim();
  let managerName = 'Не назначен';
  let responsibleUser = null;
  if (respUserId && options.usersCatalog && options.usersCatalog[respUserId]) {
    managerName = String(options.usersCatalog[respUserId]);
    responsibleUser = respUserId;
  } else if (respUserId) {
    responsibleUser = respUserId;
    managerName = `Менеджер #${respUserId}`;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  let createdAt = todayStr;
  if (typeof rawDeal.created_at === 'number' && rawDeal.created_at > 0) {
    createdAt = new Date(rawDeal.created_at * 1000).toISOString().slice(0, 10);
  } else if (typeof rawDeal.created_at === 'string' && rawDeal.created_at.length >= 10) {
    createdAt = rawDeal.created_at.slice(0, 10);
  }

  let updatedAt = todayStr;
  if (typeof rawDeal.updated_at === 'number' && rawDeal.updated_at > 0) {
    updatedAt = new Date(rawDeal.updated_at * 1000).toISOString().slice(0, 10);
  } else if (typeof rawDeal.updated_at === 'string' && rawDeal.updated_at.length >= 10) {
    updatedAt = rawDeal.updated_at.slice(0, 10);
  }

  const customFieldsRaw = rawDeal.custom_fields_values || rawDeal.custom_fields || [];
  const customPayloadStr = sanitizeCustomPayload(customFieldsRaw);

  let utmSource = '', utmMedium = '', utmCampaign = '';
  if (Array.isArray(customFieldsRaw)) {
    for (const cf of customFieldsRaw) {
      const code = String(cf.field_code || cf.name || '').toUpperCase();
      const val = cf.values && cf.values[0] && cf.values[0].value ? String(cf.values[0].value) : '';
      if (code.includes('UTM_SOURCE')) utmSource = val;
      if (code.includes('UTM_MEDIUM')) utmMedium = val;
      if (code.includes('UTM_CAMPAIGN')) utmCampaign = val;
    }
  }

  const isDeleted = Boolean(rawDeal.is_deleted || stageInfo.status === 'DELETED');
  const deletedAt = isDeleted ? (rawDeal.deleted_at || nowIso) : null;

  return {
    deal_id: dealId,
    company_name: title,
    amount,
    amount_str: `${Math.round(amount).toLocaleString('ru-RU')} ₽`,
    price_is_unknown: isPriceUnknown,
    stage_id: stageInfo.stageNum !== null ? String(stageInfo.stageNum) : '0',
    stage_name: stageInfo.stageName,
    created_at: createdAt,
    updated_at: updatedAt,
    responsible_user: responsibleUser,
    manager_name: managerName,
    segment: 'General B2B',
    source: 'amoCRM',
    client_id: rawId.replace('AMO-', ''),
    client_grade: amount >= 300000 ? 'A' : (amount >= 150000 ? 'B' : 'C'),
    lost_reason: stageInfo.isLost ? 'Отказ' : (isDeleted ? 'Удалена в CRM' : ''),
    last_stage_change: updatedAt,
    is_won: stageInfo.isWon ? '1' : '0',
    is_lost: stageInfo.isLost || isDeleted ? '1' : '0',
    is_active: stageInfo.isActive && !isDeleted ? '1' : '0',
    weighted_amount: weightedAmount,
    weighted_amount_str: weightedAmount !== null ? `${Math.round(weightedAmount).toLocaleString('ru-RU')} ₽` : '—',
    status: isDeleted ? 'DELETED' : stageInfo.status,
    is_deleted: isDeleted ? '1' : '0',
    deleted_at: deletedAt,
    custom_payload: customPayloadStr,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    channel: 'amocrm',
    synced_at: nowIso,
    tenant_id: tenantId,
    spreadsheet_id: options.spreadsheetId || ''
  };
}

/**
 * Universal Deal Normalization Dispatcher.
 */
export function normalizeDeal(rawDeal, source = 'bitrix24', tenantId = 'TNT-001', options = {}) {
  const cleanSource = String(source || 'bitrix24').toLowerCase();
  if (cleanSource.includes('amo')) {
    return normalizeAmoCRMDeal(rawDeal, tenantId, options);
  }
  return normalizeBitrix24Deal(rawDeal, tenantId, options);
}

/**
 * Universal n8n Items Processor.
 * Dispatches arbitrary n8n input items into an array of { json: normalizedDeal }.
 */
export function processN8nDealItems(items, defaultOptions = {}) {
  const results = [];

  for (const item of items) {
    const raw = item.json || item;
    const payload = raw.body || raw;

    const tenantId = raw.tenant_id || payload.tenant_id || defaultOptions.tenantId || 'TNT-001';
    const spreadsheetId = raw.spreadsheet_id || payload.spreadsheet_id || defaultOptions.spreadsheetId || '';
    const opts = { ...defaultOptions, tenantId, spreadsheetId };

    // Case 1: amoCRM webhook events: { leads: { add: [...], status: [...], delete: [...] } }
    const leads = (payload.data && payload.data.leads) || payload.leads;
    if (leads && typeof leads === 'object') {
      if (Array.isArray(leads.delete)) {
        for (const l of leads.delete) {
          const rawId = String(l.id || '').trim();
          if (rawId) {
            results.push({
              json: {
                deal_id: rawId.startsWith('AMO-') ? rawId : `AMO-${rawId}`,
                status: 'DELETED',
                is_deleted: '1',
                is_active: '0',
                is_lost: '1',
                lost_reason: 'Удалена в CRM',
                deleted_at: new Date().toISOString(),
                tenant_id: tenantId,
                spreadsheet_id: spreadsheetId
              }
            });
          }
        }
      }
      for (const evt of ['add', 'update', 'status']) {
        if (Array.isArray(leads[evt])) {
          for (const l of leads[evt]) {
            try {
              results.push({ json: normalizeAmoCRMDeal(l, tenantId, opts) });
            } catch (err) {
              console.warn(`[n8n amoCRM event] Failed to normalize lead: ${err}`);
            }
          }
        }
      }
      continue;
    }

    // Case 2: Bitrix24 webhook event ONCRMDEALDELETE
    const eventName = String(payload.event || raw.event || '').toUpperCase();
    if (eventName.includes('DEALDELETE') || eventName.includes('DELETE')) {
      const b24Fields = (payload.data && payload.data.FIELDS) || payload.FIELDS || payload;
      const rawId = String(b24Fields.ID || b24Fields.id || payload.id || '').trim();
      if (rawId) {
        results.push({
          json: {
            deal_id: rawId.startsWith('B24-') ? rawId : `B24-${rawId}`,
            status: 'DELETED',
            is_deleted: '1',
            is_active: '0',
            is_lost: '1',
            lost_reason: 'Удалена в CRM',
            deleted_at: new Date().toISOString(),
            tenant_id: tenantId,
            spreadsheet_id: spreadsheetId
          }
        });
      }
      continue;
    }

    // Case 3: Bitrix24 webhook event ONCRMDEALADD / ONCRMDEALUPDATE with nested data.FIELDS
    const b24DataFields = (payload.data && payload.data.FIELDS) || payload.FIELDS;
    if (b24DataFields && (b24DataFields.ID || b24DataFields.id)) {
      try {
        results.push({ json: normalizeBitrix24Deal(b24DataFields, tenantId, opts) });
      } catch (err) {
        console.warn(`[n8n Bitrix24 event] Failed to normalize deal: ${err}`);
      }
      continue;
    }

    // Case 4: Array of deals from REST API (B24 result: [...] or amoCRM _embedded.leads: [...])
    let dealsArray = [];
    let source = defaultOptions.source || 'bitrix24';

    if (Array.isArray(payload.result)) {
      dealsArray = payload.result;
      source = 'bitrix24';
    } else if (payload._embedded && Array.isArray(payload._embedded.leads)) {
      dealsArray = payload._embedded.leads;
      source = 'amocrm';
    } else if (Array.isArray(payload.deals)) {
      dealsArray = payload.deals;
    } else if (Array.isArray(payload)) {
      dealsArray = payload;
    } else if (payload.ID || payload.id || payload.deal_id) {
      dealsArray = [payload];
    }

    for (const d of dealsArray) {
      try {
        let dSource = source;
        const testId = String(d.ID || d.id || '');
        if (testId.startsWith('AMO-') || d.pipeline_id !== undefined || d.status_id !== undefined) {
          dSource = 'amocrm';
        } else if (testId.startsWith('B24-') || d.STAGE_ID !== undefined || d.OPPORTUNITY !== undefined) {
          dSource = 'bitrix24';
        }
        results.push({ json: normalizeDeal(d, dSource, tenantId, opts) });
      } catch (err) {
        console.warn(`[n8n item normalizer] Skip invalid item: ${err}`);
      }
    }
  }

  return results;
}

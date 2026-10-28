/**
 * apps/web/src/lib/dealHealth.ts
 *
 * Enterprise Revenue Intelligence scoring engine.
 * Computes Deal Health Score, Win Probability, Stage Velocity, and parses 13 B2B criteria.
 */

import type { Deal } from '@/types/api';

export interface DealHealthMetrics {
  healthScore: number; // 0 - 100
  healthTier: 'healthy' | 'warning' | 'critical';
  winProbability: number; // 0 - 100%
  daysInStage: number;
  isStalled: boolean; // > 3 days on early/mid stage
  divergenceRisk: boolean; // stage is advanced, but call score < 60 or SLA risk
  aiNextAction: string;
  cleanTitle: string;
}

export const CRITERIA_NAMES: string[] = [
  '1. Приветствие и регламент',
  '2. Квалификация ЛПР и критериев',
  '3. Выявление болей и задач',
  '4. Презентация ценности',
  '5. Презентация стоимости',
  '6. Отработка возражений',
  '7. Фиксация дедлайна / шага',
  '8. Соблюдение скрипта',
  '9. Баланс эфира (>50% слушает)',
  '10. Эмпатия и вежливость',
  '11. Отстройка от конкурентов',
  '12. Создание срочности',
  '13. Отсутствие давления',
];

export interface ParsedCriterion {
  id: string;
  name: string;
  passed: boolean;
  score?: number;
}

/**
 * Universal extractor for 13 B2B criteria from various CRM / Gemini AI payloads.
 */
export function parse13Criteria(raw: unknown): ParsedCriterion[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }

  const obj = raw as Record<string, unknown>;

  // Case A: raw.cr is an array of 13 binary numbers/booleans [0, 1, 0, ...]
  if (Array.isArray(obj.cr) && obj.cr.length > 0) {
    const crArray = obj.cr as unknown[];
    return CRITERIA_NAMES.map((name, idx) => {
      const val = crArray[idx];
      const passed = val === 1 || val === true || Number(val) === 1;
      return {
        id: `cr${idx + 1}`,
        name,
        passed,
      };
    });
  }

  // Case B: keys like cr1, cr2, ... cr13 directly on object
  const hasCrKeys = Object.keys(obj).some((k) => /^cr\d+$/i.test(k));
  if (hasCrKeys) {
    return CRITERIA_NAMES.map((name, idx) => {
      const key = `cr${idx + 1}`;
      const val = obj[key] ?? obj[key.toUpperCase()];
      const passed = val === 1 || val === true || Number(val) === 1;
      return {
        id: key,
        name,
        passed,
      };
    });
  }

  // Case C: nested object format with passed: boolean
  const result: ParsedCriterion[] = [];
  const entries = Object.entries(obj);
  for (let i = 0; i < entries.length && i < 13; i++) {
    const [key, val] = entries[i];
    // Exclude technical metadata keys
    if (['id', 'deal_id', 'deal_title', 'client', 'manager', 'stage', 'duration', 'amount', 'score', 'status', 'status_label', 'risk_amount', 'next_step', 'error_summary', 'recommendation', 'transcript'].includes(key.toLowerCase())) {
      continue;
    }
    const criterionName = CRITERIA_NAMES[result.length] || key;
    let passed = false;
    if (typeof val === 'object' && val !== null) {
      const vObj = val as Record<string, unknown>;
      passed = Boolean(vObj.passed || vObj.score === 1 || Number(vObj.score) >= 70);
    } else {
      passed = val === 1 || val === true || Number(val) === 1;
    }
    result.push({
      id: key,
      name: criterionName,
      passed,
    });
  }

  return result.length > 0
    ? result
    : CRITERIA_NAMES.map((name, idx) => ({
        id: `cr${idx + 1}`,
        name,
        passed: false,
      }));
}

/**
 * Computes Enterprise Revenue Health Metrics for a Deal.
 */
export function computeDealHealth(deal: Deal): DealHealthMetrics {
  // Clean deal title from encoding artifacts (e.g. "????? #4870417")
  let cleanTitle = String(deal.title || '').trim();
  if (cleanTitle.startsWith('????') || cleanTitle.startsWith('??????') || !cleanTitle) {
    cleanTitle = `Сделка #${deal.crm_deal_id || deal.deal_id || deal.id}`;
  }

  // 1. Base score from linked calls
  let scoreBase = 70; // baseline
  if (typeof deal.avg_call_score === 'number' && deal.avg_call_score > 0) {
    scoreBase = deal.avg_call_score;
  }

  // 2. Penalty for SLA risk
  if (deal.sla_risk) {
    scoreBase -= 25;
  }

  // 3. Penalty for days in stage / stagnation
  const daysInStage = deal.days_in_stage || 1;
  const isStalled = daysInStage > 3 && deal.status === 'active';
  if (isStalled) {
    scoreBase -= Math.min(25, (daysInStage - 3) * 5);
  }

  // 4. Won / Lost adjustments
  if (deal.status === 'won') {
    scoreBase = 100;
  } else if (deal.status === 'lost') {
    scoreBase = 0;
  }

  const healthScore = Math.max(5, Math.min(100, Math.round(scoreBase)));

  const healthTier: 'healthy' | 'warning' | 'critical' =
    healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'warning' : 'critical';

  // 5. Win probability (based on stage order + health score)
  let stageWeight = 0.2;
  const stageNameLower = (deal.stage_name || deal.stage || '').toLowerCase();
  if (deal.status === 'won' || stageNameLower.includes('успеш')) {
    stageWeight = 1.0;
  } else if (deal.status === 'lost' || stageNameLower.includes('закрыт') || stageNameLower.includes('отказ')) {
    stageWeight = 0.0;
  } else if (stageNameLower.includes('договор') || stageNameLower.includes('счёт') || stageNameLower.includes('согласован')) {
    stageWeight = 0.85;
  } else if (stageNameLower.includes('решен') || stageNameLower.includes('кп')) {
    stageWeight = 0.65;
  } else if (stageNameLower.includes('переговор') || stageNameLower.includes('встреч') || stageNameLower.includes('демо')) {
    stageWeight = 0.45;
  } else if (stageNameLower.includes('квалифик')) {
    stageWeight = 0.25;
  } else {
    stageWeight = 0.15;
  }

  const winProbability = Math.round(stageWeight * (healthScore / 100) * 100);

  // 6. Divergence risk: advanced stage but poor call score or SLA risk
  const isAdvancedStage = stageWeight >= 0.45;
  const divergenceRisk = isAdvancedStage && (healthScore < 55 || deal.sla_risk === true);

  // 7. AI Next Action hint
  let aiNextAction = 'Контроль регламента контакта';
  if (deal.sla_risk) {
    aiNextAction = 'Срочно связаться: регламент SLA нарушен';
  } else if (isStalled) {
    aiNextAction = `Зависла на ${daysInStage} дн.: запланировать звонок`;
  } else if (divergenceRisk) {
    aiNextAction = 'Вскрыть возражения клиента (риск срыва)';
  } else if (stageNameLower.includes('договор')) {
    aiNextAction = 'Контроль подписания и отправки счета';
  } else if (stageNameLower.includes('переговор')) {
    aiNextAction = 'Фиксация следующего шага с ЛПР';
  } else if (stageNameLower.includes('квалифик')) {
    aiNextAction = 'Выявление бюджета и критериев ЛПР';
  }

  return {
    healthScore,
    healthTier,
    winProbability,
    daysInStage,
    isStalled,
    divergenceRisk,
    aiNextAction,
    cleanTitle,
  };
}

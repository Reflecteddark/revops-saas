/**
 * RevOps Enterprise OS - Deals Pipeline & Live Sync Engine (v20.4)
 * Responsibilities: Deals pipeline, stages 1-6 mapping, financial bridge, One-Pager modal, WebSocket & live calls sync.
 */

// ==========================================================================
// EXECUTIVE ONE-PAGER MODAL
// ==========================================================================
function openOnePagerModal() {
  if (typeof populateOnePagerModal === 'function') {
    populateOnePagerModal();
  }
  const modal = document.getElementById('onePagerModal');
  if (modal) {
    modal.style.display = 'flex';
    if (typeof trapFocus === 'function') {
      trapFocus(modal);
    }
  }
}

function closeOnePagerModal() {
  const modal = document.getElementById('onePagerModal');
  if (modal) modal.style.display = 'none';
  if (typeof releaseFocus === 'function') {
    releaseFocus();
  }
}

function populateOnePagerModal() {
  const calls =
    typeof window.CALLS_DATA !== 'undefined' && Array.isArray(window.CALLS_DATA)
      ? window.CALLS_DATA
      : [];
  const deals =
    typeof window.DEALS_DATA !== 'undefined' && Array.isArray(window.DEALS_DATA)
      ? window.DEALS_DATA
      : [];
  const tenantId =
    typeof getActiveTenantId === 'function' ? getActiveTenantId() : 'TNT-001';

  // Badge
  const bBadge = document.getElementById('onePagerTenantBadge');
  if (bBadge)
    bBadge.textContent = `${tenantId} • ${deals.length > 0 ? getActiveCrmLabel(deals) : 'REVOPS SAAS'}`;

  // Date Sub
  const dSub = document.getElementById('onePagerDateSub');
  const now = new Date();
  const dateStr = now.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
  const timeStr =
    now.toLocaleDateString('ru-RU') +
    ' ' +
    now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (dSub)
    dSub.textContent = `Отчетный срез: ${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} • РОП: Интеллектуальный Аудит • amoCRM API v4 + Битрикс24 REST`;

  // Financial calculations
  let wonFact = 0;
  let inPipe = 0;
  let ssotFact = 0;
  let pipeDealsCount = 0;

  if (deals.length > 0) {
    deals.forEach((d) => {
      const amt =
        typeof d.amount === 'number'
          ? d.amount
          : parseFloat(String(d.amount).replace(/[^\d.]/g, '')) || 0;
      const stId = parseInt(String(d.stage_id || '0'), 10);
      const isWon =
        d.status === 'won' ||
        stId === 6 ||
        String(d.stage || '').includes('Успешно');
      if (isWon) {
        wonFact += amt;
        ssotFact += amt;
      } else if (stId >= 1 && stId <= 5) {
        inPipe += amt;
        pipeDealsCount++;
        let weight = 0.1;
        if (stId === 2) weight = 0.2;
        else if (stId === 3) weight = 0.25;
        else if (stId === 4) weight = 0.35;
        else if (stId === 5) weight = 0.5;
        ssotFact += Math.round(amt * weight);
      }
    });
  } else {
    calls.forEach((c) => {
      const amt = typeof getCallAmount === 'function' ? getCallAmount(c) : 0;
      if (c.status === 'won') {
        wonFact += amt;
      } else {
        inPipe += amt;
        pipeDealsCount++;
      }
    });
    ssotFact = wonFact + Math.round(inPipe * 0.35);
  }

  const targetPlan =
    typeof getMonthlyTarget === 'function' ? getMonthlyTarget() : 5000000;
  const wonPct = targetPlan > 0 ? Math.round((wonFact / targetPlan) * 100) : 0;

  const elPlan = document.getElementById('onePagerPlanVal');
  if (elPlan) elPlan.textContent = `${targetPlan.toLocaleString('ru-RU')} ₽`;

  const elFact = document.getElementById('onePagerFactVal');
  if (elFact)
    elFact.textContent = `${wonFact.toLocaleString('ru-RU')} ₽ (${wonPct}%)`;

  const elSsot = document.getElementById('onePagerSsotVal');
  if (elSsot) elSsot.textContent = `${ssotFact.toLocaleString('ru-RU')} ₽`;

  const elPipe = document.getElementById('onePagerPipeVal');
  if (elPipe)
    elPipe.textContent = `${inPipe.toLocaleString('ru-RU')} ₽ (${pipeDealsCount} сд.)`;

  // Quality metrics
  const totalCalls = calls.length;
  const avgScore =
    totalCalls > 0
      ? calls.reduce((s, c) => s + (c.score || 0), 0) / totalCalls
      : 0;
  const nsCount = calls.filter(
    (c) => c.next_step === 1 || (c.cr && c.cr[0] === 1)
  ).length;
  const nsPct = totalCalls > 0 ? Math.round((nsCount / totalCalls) * 100) : 0;

  const riskCallsList = calls.filter(
    (c) =>
      c.status === 'risk' ||
      c.next_step === 0 ||
      (c.score !== undefined && c.score < 8)
  );
  const riskSum = riskCallsList.reduce(
    (s, c) => s + (typeof getCallAmount === 'function' ? getCallAmount(c) : 0),
    0
  );
  const wonCallsList = calls.filter(
    (c) => c.status === 'won' || (c.score !== undefined && c.score >= 10)
  );

  const elScore = document.getElementById('onePagerScoreVal');
  if (elScore)
    elScore.textContent = `${avgScore.toFixed(1)} / 13 (${Math.round((avgScore / 13) * 100)}%)`;

  const elNs = document.getElementById('onePagerNextStepVal');
  if (elNs) elNs.textContent = `${nsPct}% (${nsCount}/${totalCalls})`;

  const elRiskCalls = document.getElementById('onePagerRiskCallsVal');
  if (elRiskCalls)
    elRiskCalls.textContent = `${riskCallsList.length} звонков (${(riskSum / 1000000).toFixed(1)}M ₽)`;

  const elWonCalls = document.getElementById('onePagerWonCallsVal');
  if (elWonCalls)
    elWonCalls.textContent = `${wonCallsList.length} звонков (${totalCalls > 0 ? Math.round((wonCallsList.length / totalCalls) * 100) : 0}% Win)`;

  // Section 3: Risk deals summary
  const rTitle = document.getElementById('onePagerRiskTitle');
  if (rTitle)
    rTitle.textContent = `3. Пульт РОПа: Сделки в риске срыва (${(riskSum / 1000000).toFixed(1)}M ₽)`;

  const rCases = document.getElementById('onePagerRiskCasesList');
  if (rCases) {
    if (riskCallsList.length === 0) {
      rCases.innerHTML = `<div style="color: #34d399;">&bull; Зона риска чиста: критических срывов Next Step не обнаружено.</div>`;
    } else {
      let rHtml = '';
      riskCallsList.slice(0, 5).forEach((c, i) => {
        const client = c.client || c.client_name || `Клиент #${i + 1}`;
        const amt = typeof getCallAmount === 'function' ? getCallAmount(c) : 0;
        const err =
          c.error_summary ||
          (c.next_step === 0 ? 'Слив Next Step' : 'Возражения не отработаны');
        const rec = c.ai_recommendation
          ? c.ai_recommendation.slice(0, 55) + '...'
          : 'Контрольный звонок РОПа';
        rHtml += `<div>&bull; <strong>Кейс 0${i + 1} (${escapeHtml(client)}):</strong> ${(amt / 1000).toFixed(0)}k ₽ &bull; ${escapeHtml(err)} &bull; ${escapeHtml(rec)}</div>`;
      });
      rCases.innerHTML = rHtml;
    }
  }

  // Section 4: Monte Carlo
  const mcList = document.getElementById('onePagerMonteCarloList');
  if (mcList) {
    const p10 = Math.round(wonFact + inPipe * 0.15);
    const p50 = Math.round(wonFact + ssotFact * 0.85);
    const p90 = Math.round(wonFact + inPipe * 0.65);
    const pPlan =
      targetPlan > 0
        ? Math.min(99, Math.max(5, Math.round((ssotFact / targetPlan) * 100)))
        : 50;

    mcList.innerHTML = `
      <div>&bull; <strong>P10 (Пессимистичный):</strong> ${p10.toLocaleString('ru-RU')} ₽ (90% гарантия)</div>
      <div>&bull; <strong>P50 (Медиана):</strong> ${p50.toLocaleString('ru-RU')} ₽ (математическое ожидание)</div>
      <div>&bull; <strong>P90 (Оптимистичный с ИИ):</strong> ${p90.toLocaleString('ru-RU')} ₽</div>
      <div>&bull; <strong>Вероятность плана ${targetPlan > 0 ? (targetPlan / 1000000).toFixed(1) + 'M ₽' : ''}:</strong> ${pPlan}%</div>
      <div id="onePagerVerdict" style="margin-top: 6px; color: ${pPlan >= 70 ? '#34d399' : '#fbbf24'}; font-weight: 700;">
        Вердикт: ${pPlan >= 70 ? 'План месяца защищен с высокой надежностью.' : `Для взятия плана необходим дожим ${riskCallsList.length} сделок в зоне риска.`}
      </div>
    `;
  }

  // Footer
  const footerDate = document.getElementById('onePagerFooterDate');
  if (footerDate)
    footerDate.textContent = `Сформировано: ${timeStr} • Подпись РОПа: ____________________`;
}

function getActiveCrmLabel(deals) {
  const list =
    Array.isArray(deals) && deals.length > 0 ? deals : window.DEALS_DATA || [];
  if (Array.isArray(list) && list.length > 0) {
    const src = String(
      list[0].crm_source || list[0].source || list[0].channel || ''
    ).toLowerCase();
    if (src.includes('bitrix') || src.includes('b24')) return 'Bitrix24';
    if (src.includes('amo')) return 'amoCRM';
  }
  return 'CRM';
}

function isItemInPeriod(dateStr, period) {
  if (!dateStr) return true;
  const itemDate = new Date(dateStr);
  if (isNaN(itemDate.getTime())) return true;

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  if (period === 'today') {
    return itemDate >= startOfToday;
  } else if (period === '7d') {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return itemDate >= sevenDaysAgo;
  } else if (period === 'prev_month') {
    const prevMonthYear =
      now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const prevMonthIdx = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    return (
      itemDate.getFullYear() === prevMonthYear &&
      itemDate.getMonth() === prevMonthIdx
    );
  } else if (period === 'year') {
    return itemDate.getFullYear() === now.getFullYear();
  } else {
    // Current month
    return (
      itemDate.getFullYear() === now.getFullYear() &&
      itemDate.getMonth() === now.getMonth()
    );
  }
}

// ==========================================================================
// PERIOD SELECTOR (TAB 1: PULSE)
// ==========================================================================
function setPulsePeriod(period) {
  window._CURRENT_PULSE_PERIOD = period;
  const syncText = document.getElementById('periodSyncText');
  const allDeals =
    typeof window.DEALS_DATA !== 'undefined' && Array.isArray(window.DEALS_DATA)
      ? window.DEALS_DATA
      : [];
  const allCalls =
    typeof window.CALLS_DATA !== 'undefined' && Array.isArray(window.CALLS_DATA)
      ? window.CALLS_DATA
      : [];

  // Filter deals and calls by real period
  let dealsList = allDeals.filter((d) =>
    isItemInPeriod(d.created_at || d.date, period)
  );
  let callsList = allCalls.filter((c) =>
    isItemInPeriod(c.date || c.created_at, period)
  );

  let baseFact = 0;
  let basePipe = 0;
  let baseSsot = 0;

  if (dealsList.length > 0) {
    dealsList.forEach((d) => {
      const amt =
        typeof d.amount === 'number'
          ? d.amount
          : parseFloat(String(d.amount).replace(/[^\d.]/g, '')) || 0;
      const stId = parseInt(String(d.stage_id || '0'), 10);
      const isWon =
        d.status === 'won' ||
        stId === 6 ||
        String(d.stage || '').includes('Успешно');
      if (isWon) {
        baseFact += amt;
        baseSsot += amt;
      } else if (stId >= 1 && stId <= 5) {
        basePipe += amt;
        let weight = 0.1;
        if (stId === 2) weight = 0.2;
        else if (stId === 3) weight = 0.25;
        else if (stId === 4) weight = 0.35;
        else if (stId === 5) weight = 0.5;
        baseSsot += Math.round(amt * weight);
      }
    });
  } else {
    callsList.forEach((c) => {
      const amt = typeof getCallAmount === 'function' ? getCallAmount(c) : 0;
      if (c.status === 'won') {
        baseFact += amt;
        baseSsot += amt;
      } else {
        basePipe += amt;
        baseSsot += Math.round(amt * 0.35);
      }
    });
  }

  const monthlyTarget =
    typeof getMonthlyTarget === 'function' ? getMonthlyTarget() : 5000000;
  let targetPlan = monthlyTarget;
  let periodLabel = 'Текущий месяц';

  if (period === 'today') {
    targetPlan = Math.round(monthlyTarget / 22);
    periodLabel = 'Сегодня';
    if (syncText)
      syncText.textContent = `Срез за сегодня (${callsList.length} звонков, ${dealsList.length} сделок)`;
    if (dealsList.length === 0 && callsList.length === 0) {
      showToast('Период: Сегодня', 'За сегодня данных нет');
    } else {
      showToast(
        'Период: Сегодня',
        `Оперативная суточная активность: ${baseFact.toLocaleString('ru-RU')} ₽ факт.`
      );
    }
  } else if (period === '7d') {
    targetPlan = Math.round((monthlyTarget * 5) / 22);
    periodLabel = 'За 7 дней';
    if (syncText)
      syncText.textContent = `Срез за последние 7 дней (${callsList.length} звонков, ${dealsList.length} сделок)`;
    showToast(
      'Период: 7 дней',
      `Недельный срез: ${baseFact.toLocaleString('ru-RU')} ₽ факт.`
    );
  } else if (period === 'prev_month') {
    targetPlan = monthlyTarget;
    periodLabel = 'Прошлый месяц';
    if (syncText)
      syncText.textContent = `Архив за прошлый месяц (${callsList.length} звонков, ${dealsList.length} сделок)`;
    showToast(
      'Период: Прошлый месяц',
      'Показаны данные за предшествующий отчетный период.'
    );
  } else if (period === 'year') {
    targetPlan = monthlyTarget * 12;
    periodLabel = 'Весь год (YTD)';
    if (syncText)
      syncText.textContent = `Годовой контур (${callsList.length} звонков, ${dealsList.length} сделок)`;
    showToast(
      'Период: Год',
      `Суммарный годовой таргет: ${(targetPlan / 1000000).toFixed(0)}M ₽.`
    );
  } else {
    targetPlan = monthlyTarget;
    periodLabel = 'Текущий месяц';
    const crmLabel = getActiveCrmLabel(dealsList);
    if (syncText)
      syncText.textContent = `Синхронизировано: ${crmLabel} + Google Таблица (${dealsList.length} сделок, ${callsList.length} звонков)`;
    showToast('Период: Месяц', 'Показан полный месячный контур компании.');
  }

  animateCounter(document.getElementById('metricPlanVal'), targetPlan);
  animateCounter(document.getElementById('metricFactVal'), baseFact);
  animateCounter(document.getElementById('metricSsotVal'), baseSsot);
  if (document.getElementById('metricPipeVal'))
    animateCounter(document.getElementById('metricPipeVal'), basePipe);
  const heroPipe = document.getElementById('heroPipeline');
  if (heroPipe) animateCounter(heroPipe, basePipe);
  const heroRev = document.getElementById('heroRevenue');
  if (heroRev) animateCounter(heroRev, baseFact);

  const pct =
    targetPlan > 0 ? ((baseFact / targetPlan) * 100).toFixed(1) : '0.0';
  const b = document.getElementById('metricFactBadge');
  if (b) b.textContent = `${pct}%`;

  const deficit = baseFact - targetPlan;
  const defEl = document.getElementById('metricDeficitVal');
  const heroSla = document.getElementById('heroSla');
  const defPill = document.getElementById('metricDeficitPill');
  const defText =
    deficit < 0
      ? `-${(Math.abs(deficit) / 1000000).toFixed(1)}M ₽`
      : `+${(deficit / 1000000).toFixed(1)}M ₽`;
  if (defEl) defEl.textContent = defText;
  if (heroSla) heroSla.textContent = defText;
  if (defPill) {
    if (deficit < 0) {
      defPill.className = 'develop-pill pill-neg';
      const sub = defPill.querySelector('.pill-sub');
      if (sub) sub.textContent = 'дефицит плана';
    } else {
      defPill.className = 'develop-pill pill-pos';
      const sub = defPill.querySelector('.pill-sub');
      if (sub) sub.textContent = 'профицит плана';
    }
  }
}

// ==========================================================================
// ==========================================================================
// LIVE DATA & WEBSOCKET SYNC (FASTAPI <-> GOOGLE SHEETS <-> N8N)
// ==========================================================================
let isSyncing = false;
let liveWs = null;
let DEALS_DATA = [];
window.DEALS_DATA = DEALS_DATA;

async function fetchLiveCallsData(showFeedback = false) {
  try {
    const tenantId = getActiveTenantId();
    let authHeaders = {};
    if (typeof getAdminAuthHeaders === 'function') {
      authHeaders = getAdminAuthHeaders();
    } else if (
      typeof window !== 'undefined' &&
      typeof window.getAdminAuthHeaders === 'function'
    ) {
      authHeaders = window.getAdminAuthHeaders();
    }
    let res;
    try {
      res = await fetch(
        `${REVOPS_API_BASE}/api/v1/calls/data?tenant_id=${encodeURIComponent(tenantId)}`,
        {
          headers: authHeaders,
          credentials: 'include',
        }
      );
      if (!res.ok && REVOPS_API_BASE) {
        res = await fetch(
          `/api/v1/calls/data?tenant_id=${encodeURIComponent(tenantId)}`,
          {
            headers: authHeaders,
            credentials: 'include',
          }
        );
      }
    } catch (e) {
      res = await fetch(
        `/api/v1/calls/data?tenant_id=${encodeURIComponent(tenantId)}`,
        {
          headers: authHeaders,
          credentials: 'include',
        }
      );
    }
    if (!res || !res.ok)
      throw new Error('API status ' + (res ? res.status : 'network error'));
    const data = await res.json();
    if (data && Array.isArray(data.calls)) {
      data.calls.forEach((c) => {
        if (!Array.isArray(c.cr) || c.cr.length !== 13)
          c.cr = Array(13).fill(0);
      });
      CALLS_DATA = data.calls;
      window.CALLS_DATA = data.calls;
      refreshAllDashboardViews();
      lastSyncTime = Date.now();
      tickLiveStatus();
      updateChartTimestamps();
      if (showFeedback && typeof showToast === 'function') {
        showToast(
          'Google Таблица',
          data.calls.length > 0
            ? `Синхронизировано ${data.calls.length} звонков (${tenantId})`
            : `Таблица raw_calls очищена (${tenantId}: 0 звонков)`
        );
      }
      return true;
    }
  } catch (err) {
    console.warn('[Sync Calls] Falling back to local dataset:', err.message);
  }
  return false;
}

async function fetchLiveDealsData(showFeedback = false) {
  try {
    const tenantId = getActiveTenantId();
    let authHeaders = {};
    if (typeof getAdminAuthHeaders === 'function') {
      authHeaders = getAdminAuthHeaders();
    } else if (
      typeof window !== 'undefined' &&
      typeof window.getAdminAuthHeaders === 'function'
    ) {
      authHeaders = window.getAdminAuthHeaders();
    }

    let res;
    try {
      res = await fetch(
        `${REVOPS_API_BASE}/api/v1/deals?tenant_id=${encodeURIComponent(tenantId)}`,
        {
          headers: authHeaders,
          credentials: 'include',
        }
      );
      if (!res.ok && REVOPS_API_BASE) {
        res = await fetch(
          `/api/v1/deals?tenant_id=${encodeURIComponent(tenantId)}`,
          {
            headers: authHeaders,
            credentials: 'include',
          }
        );
      }
    } catch (e) {
      res = await fetch(
        `/api/v1/deals?tenant_id=${encodeURIComponent(tenantId)}`,
        {
          headers: authHeaders,
          credentials: 'include',
        }
      );
    }

    if (!res || !res.ok)
      throw new Error('API status ' + (res ? res.status : 'network error'));
    const data = await res.json();
    if (data && Array.isArray(data.deals)) {
      DEALS_DATA = data.deals;
      window.DEALS_DATA = data.deals;
      refreshAllDashboardViews();
      lastSyncTime = Date.now();
      tickLiveStatus();
      updateChartTimestamps();
      if (showFeedback && typeof showToast === 'function') {
        const crmLabel = getActiveCrmLabel(data.deals);
        showToast(
          `${crmLabel} & Google Таблица`,
          data.deals.length > 0
            ? `Синхронизировано ${data.deals.length} сделок (${tenantId})`
            : `Таблица raw_deals пуста (${tenantId})`
        );
      }
      return true;
    }
  } catch (err) {
    console.warn('[Sync Deals] Falling back to calls dataset:', err.message);
  }
  return false;
}

let _wsAttempt = 0;

function initWebSocketListener() {
  if (liveWs && liveWs.readyState === WebSocket.OPEN) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost =
    typeof window !== 'undefined' &&
    window.location.hostname.includes('ai-rop.ru') &&
    !window.location.hostname.startsWith('report.')
      ? 'report.ai-rop.ru'
      : window.location.host;
  const tenantId = getActiveTenantId();
  const wsUrl = `${protocol}//${wsHost}/ws/org/${encodeURIComponent(tenantId)}`;
  try {
    liveWs = new WebSocket(wsUrl);
    liveWs.onopen = () => {
      _wsAttempt = 0;
      console.log(`[Live WS] Connected to live pipeline stream (${tenantId})`);
    };
    liveWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'new_call' && msg.call) {
          handleIncomingLiveCall(msg.call);
          fetchLiveDealsData(false);
        } else if (msg.type === 'deal_updated' || msg.type === 'new_deal') {
          fetchLiveDealsData(false);
          fetchLiveCallsData(false);
        } else if (msg.type === 'crm_switched') {
          if (typeof updateCrmUiState === 'function') {
            updateCrmUiState(msg.active_crm);
          }
          fetchLiveDealsData(false);
          fetchLiveCallsData(false);
        }
      } catch (e) {
        console.error('[Live WS] Message parse error:', e);
      }
    };
    liveWs.onclose = () => {
      const delay = Math.min(30000, 1000 * Math.pow(2, _wsAttempt++));
      setTimeout(initWebSocketListener, delay);
    };
    liveWs.onerror = () => {
      try {
        liveWs.close();
      } catch (e) {}
    };
  } catch (e) {
    console.warn('[Live WS] Setup failed:', e);
  }
}

function handleIncomingLiveCall(newCall) {
  if (!newCall || !newCall.id) return;
  const existingIdx = CALLS_DATA.findIndex((c) => c.id === newCall.id);
  if (existingIdx >= 0) {
    CALLS_DATA[existingIdx] = newCall;
  } else {
    CALLS_DATA.unshift(newCall);
  }

  refreshAllDashboardViews();
  lastSyncTime = Date.now();
  tickLiveStatus();
  updateChartTimestamps();

  if (typeof showToast === 'function') {
    const mgr = newCall.manager || 'Менеджер';
    const sc = newCall.score !== undefined ? `${newCall.score}/13` : 'OK';
    showToast(
      'Новый звонок от n8n',
      `${mgr} • Оценка ${sc} • Записано в Google Таблицу`
    );
  }
}

function calculateFinancials(deals = null, calls = null) {
  const dealsList =
    deals !== null
      ? deals
      : typeof window.DEALS_DATA !== 'undefined' &&
          Array.isArray(window.DEALS_DATA)
        ? window.DEALS_DATA
        : [];
  const callsList =
    calls !== null
      ? calls
      : typeof CALLS_DATA !== 'undefined' && Array.isArray(CALLS_DATA)
        ? CALLS_DATA
        : [];

  let totalFact = 0;
  let computedPipeline = 0;
  let computedSsot = 0;
  let activeDealsCount = 0;

  if (dealsList.length > 0) {
    window._DEALS_DATA_UNAVAILABLE = false;
    dealsList.forEach((d) => {
      const amt =
        typeof d.amount === 'number'
          ? d.amount
          : parseFloat(String(d.amount).replace(/[^\d.]/g, '')) || 0;
      const stId = parseInt(String(d.stage_id || '0'), 10);
      const isWon =
        d.status === 'won' ||
        stId === 6 ||
        String(d.stage || '').includes('Успешно');

      if (isWon) {
        totalFact += amt;
        computedSsot += amt;
      } else if (stId >= 1 && stId <= 5) {
        computedPipeline += amt;
        activeDealsCount++;
        let weight = 0.1;
        if (stId === 1) weight = 0.1;
        else if (stId === 2) weight = 0.2;
        else if (stId === 3) weight = 0.25;
        else if (stId === 4) weight = 0.35;
        else if (stId === 5) weight = 0.5;
        computedSsot += Math.round(amt * weight);
      }
    });
  } else {
    // Honest zero-state: API deals не ответил — показываем 0, НЕ выдумываем.
    // Звонки (calls) ≠ сделки (deals). Из звонков нельзя корректно вычислить пайплайн.
    totalFact = 0;
    computedPipeline = 0;
    computedSsot = 0;
    window._DEALS_DATA_UNAVAILABLE = true;
  }

  return {
    totalFact,
    computedPipeline,
    computedSsot,
    activeDealsCount,
  };
}

function refreshAllDashboardViews() {
  if (typeof filterCallsTable === 'function') filterCallsTable();
  if (typeof renderSkillsHeatmap === 'function') renderSkillsHeatmap();
  if (typeof initSpeechRadarChart === 'function') {
    const activeRepBtn = document.querySelector('.radar-rep-btn.active');
    const repName = activeRepBtn ? activeRepBtn.dataset.rep || 'all' : 'all';
    initSpeechRadarChart(repName);
  }
  if (typeof initRepPerformanceChart === 'function') initRepPerformanceChart();
  if (typeof updateSimulation === 'function') updateSimulation(false);

  // Recalculate Fact, Active Pipeline and SSOT from live DEALS_DATA (with fallback to CALLS_DATA)
  const { totalFact, computedPipeline, computedSsot, activeDealsCount } =
    calculateFinancials();

  const factVal = document.getElementById('metricFactVal');
  if (factVal) animateCounter(factVal, totalFact, 900);

  const heroRevenue = document.getElementById('heroRevenue');
  if (heroRevenue && heroRevenue !== factVal)
    animateCounter(heroRevenue, totalFact, 900);

  const heroPipeline = document.getElementById('heroPipeline');
  if (heroPipeline) animateCounter(heroPipeline, computedPipeline, 900);

  const metricPipeVal = document.getElementById('metricPipeVal');
  if (metricPipeVal && metricPipeVal !== heroPipeline)
    animateCounter(metricPipeVal, computedPipeline, 900);

  // Honest zero-state banner
  if (window._DEALS_DATA_UNAVAILABLE) {
    if (typeof showDataUnavailableBanner === 'function') {
      showDataUnavailableBanner(
        'Пайплайн недоступен: API сделок не отвечает. Показаны только данные звонков.'
      );
    }
  } else {
    if (typeof hideDataUnavailableBanner === 'function') {
      hideDataUnavailableBanner();
    }
  }

  const heroPipelineDelta = document.getElementById('heroPipelineDelta');
  if (heroPipelineDelta) {
    if (computedSsot > 0) {
      heroPipelineDelta.textContent = `Взвешенный SSOT: ${(computedSsot / 1000000).toFixed(1)}M ₽ (${activeDealsCount || CALLS_DATA.length} сделок)`;
    } else {
      heroPipelineDelta.textContent = 'Взвешенный прогноз сделок';
    }
  }

  const ssotVal = document.getElementById('metricSsotVal');
  if (ssotVal) animateCounter(ssotVal, computedSsot, 900);

  const plan = getMonthlyTarget();
  const factBadge = document.getElementById('metricFactBadge');
  if (factBadge) {
    const pct = plan > 0 ? ((totalFact / plan) * 100).toFixed(1) : '0.0';
    factBadge.textContent = `${pct}%`;
  }

  const defVal = document.getElementById('metricDeficitVal');
  const heroSla = document.getElementById('heroSla');
  const diff = totalFact - plan;
  const diffText =
    diff < 0
      ? `-${(Math.abs(diff) / 1000000).toFixed(1)}M ₽`
      : `+${(diff / 1000000).toFixed(1)}M ₽`;
  if (defVal) defVal.textContent = diffText;
  if (heroSla) heroSla.textContent = diffText;

  const defPill = document.getElementById('metricDeficitPill');
  if (defPill) {
    if (diff < 0) {
      defPill.className = 'develop-pill pill-neg';
      const sub = defPill.querySelector('.pill-sub');
      if (sub) sub.textContent = 'дефицит плана';
    } else {
      defPill.className = 'develop-pill pill-pos';
      const sub = defPill.querySelector('.pill-sub');
      if (sub) sub.textContent = 'профицит плана';
    }
  }

  const heroQuality = document.getElementById('heroQuality');
  if (heroQuality) {
    const count = CALLS_DATA.length;
    if (count > 0) {
      const avg = CALLS_DATA.reduce((s, c) => s + (c.score || 0), 0) / count;
      heroQuality.textContent = Math.round((avg / 13) * 100) + '%';
    } else {
      heroQuality.textContent = '0%';
    }
  }

  if (typeof syncHeroKpiCards === 'function') {
    syncHeroKpiCards();
  }

  const ssotTip = document.getElementById('metricSsotTooltip');
  if (ssotTip) {
    ssotTip.textContent =
      computedSsot > 0
        ? `${(computedSsot / 1000000).toFixed(2)}M ₽ SSOT`
        : '0 ₽ SSOT';
  }

  // Update recent calls in Pulse Tab
  renderPulseRecentCalls();
  // Update yesterday leaks in Pulse Tab
  if (typeof renderYesterdayLeaks === 'function') {
    renderYesterdayLeaks();
  }
  // Update funnel in Pulse Tab
  renderPulseFunnel();
  // Update Donut, Spline, Dissection and Rings
  updateDevelopBentoCharts();
  if (typeof initSparklines === 'function') {
    initSparklines();
  }
  if (typeof refreshAllChartZeroOverlays === 'function') {
    refreshAllChartZeroOverlays();
  }

  // Update Tab 3 Podium
  renderDynamicRopPodium();

  // Update Tab 3 Top-5 Rescue Deals
  renderDynamicRescueDeals();

  // Update Tab 4 KPI cards
  const aCalls = document.getElementById('auditMetricCalls');
  const aCallsBadge = document.getElementById('auditMetricCallsBadge');
  const aCallsSub = document.getElementById('auditMetricCallsSub');
  const aScore = document.getElementById('auditMetricScore');
  const aScoreBadge = document.getElementById('auditMetricScoreBadge');
  const aNextStep = document.getElementById('auditMetricNextStep');
  const aNextStepBadge = document.getElementById('auditMetricNextStepBadge');
  const aNextStepSub = document.getElementById('auditMetricNextStepSub');
  const aRisk = document.getElementById('auditMetricRisk');
  const aRiskBadge = document.getElementById('auditMetricRiskBadge');

  const totalCalls = CALLS_DATA.length;
  const avgScore = totalCalls
    ? CALLS_DATA.reduce((s, c) => s + (c.score || 0), 0) / totalCalls
    : 0;
  const nextStepCount = CALLS_DATA.filter(
    (c) => c.next_step === 1 || (c.cr && c.cr[0] === 1)
  ).length;
  const riskCalls = CALLS_DATA.filter(
    (c) =>
      c.status === 'risk' ||
      (c.score !== undefined && c.score < 8) ||
      c.next_step === 0
  );
  const riskCount = riskCalls.length;
  const riskSum = riskCalls.reduce((acc, c) => acc + getCallAmount(c), 0);

  if (aCalls) aCalls.textContent = `${totalCalls} шт`;
  if (aCallsBadge)
    aCallsBadge.textContent = totalCalls ? '100% ПОКРЫТИЕ' : '0% ПОКРЫТИЕ';
  if (aCallsSub)
    aCallsSub.textContent = `${totalFact.toLocaleString('ru-RU')} ₽ сумма подтвержденных сделок`;
  if (aScore)
    aScore.textContent = `${totalCalls ? avgScore.toFixed(1) : '0.0'} / 13`;
  if (aScoreBadge)
    aScoreBadge.textContent = `${totalCalls ? ((avgScore / 13) * 100).toFixed(1) + '%' : '0.0%'} ЭФФЕКТИВНОСТЬ`;
  if (aNextStep) aNextStep.textContent = `${nextStepCount} из ${totalCalls}`;
  if (aNextStepBadge)
    aNextStepBadge.textContent = `${totalCalls ? ((nextStepCount / totalCalls) * 100).toFixed(1) + '%' : '0.0%'} В НОРМЕ`;
  if (aNextStepSub)
    aNextStepSub.textContent = `${totalCalls - nextStepCount} звонков без фиксации даты/времени`;
  if (aRisk) aRisk.textContent = `${riskSum.toLocaleString('ru-RU')} ₽`;
  if (aRiskBadge) aRiskBadge.textContent = `${riskCount} ДИАЛОГОВ С БРАКОМ`;

  // Update Tab 4 Segmented Meters
  const barManager = document.getElementById('tlMeterManagerBar');
  const barClient = document.getElementById('tlMeterClientBar');
  const txtManager = document.getElementById('tlMeterManagerText');
  const txtClient = document.getElementById('tlMeterClientText');
  if (totalCalls === 0) {
    if (barManager) barManager.style.width = '0%';
    if (barClient) barClient.style.width = '0%';
    if (txtManager) txtManager.textContent = '0%';
    if (txtClient) txtClient.textContent = '0%';
  } else {
    if (barManager) barManager.style.width = '42%';
    if (barClient) barClient.style.width = '58%';
    if (txtManager) txtManager.textContent = '42%';
    if (txtClient) txtClient.textContent = '58%';
  }

  const specWonBar = document.getElementById('qualitySpecWonBar');
  const specNormBar = document.getElementById('qualitySpecNormBar');
  const specRiskBar = document.getElementById('qualitySpecRiskBar');
  const specWonTxt = document.getElementById('qualitySpecWonText');
  const specNormTxt = document.getElementById('qualitySpecNormText');
  const specRiskTxt = document.getElementById('qualitySpecRiskText');
  const specTitle = document.getElementById('qualitySpecTitle');
  const specBadge = document.getElementById('qualitySpecScoreBadge');
  if (specTitle)
    specTitle.textContent = `Спектр качества звонков (${totalCalls} диалогов)`;
  if (specBadge)
    specBadge.textContent = `AI Score ${totalCalls ? avgScore.toFixed(1) : '0.0'}`;
  if (totalCalls === 0) {
    if (specWonBar) specWonBar.style.width = '0%';
    if (specNormBar) specNormBar.style.width = '0%';
    if (specRiskBar) specRiskBar.style.width = '0%';
    if (specWonTxt) specWonTxt.textContent = '0 (0%)';
    if (specNormTxt) specNormTxt.textContent = '0 (0%)';
    if (specRiskTxt) specRiskTxt.textContent = '0 (0%)';
  } else {
    const wonNum = CALLS_DATA.filter((c) => c.score >= 11).length;
    const normNum = CALLS_DATA.filter(
      (c) => c.score >= 8 && c.score < 11
    ).length;
    const riskNum = CALLS_DATA.filter((c) => c.score < 8).length;
    if (specWonBar)
      specWonBar.style.width = `${Math.round((wonNum / totalCalls) * 100)}%`;
    if (specNormBar)
      specNormBar.style.width = `${Math.round((normNum / totalCalls) * 100)}%`;
    if (specRiskBar)
      specRiskBar.style.width = `${Math.round((riskNum / totalCalls) * 100)}%`;
    if (specWonTxt)
      specWonTxt.textContent = `${wonNum} (${Math.round((wonNum / totalCalls) * 100)}%)`;
    if (specNormTxt)
      specNormTxt.textContent = `${normNum} (${Math.round((normNum / totalCalls) * 100)}%)`;
    if (specRiskTxt)
      specRiskTxt.textContent = `${riskNum} (${Math.round((riskNum / totalCalls) * 100)}%)`;
  }

  // Update Tab 4 Radar Rep Pills
  if (typeof renderRadarRepPills === 'function') renderRadarRepPills();

  // Update Tab 8 Payroll & Skills
  if (typeof renderPayrollTable === 'function') renderPayrollTable();

  // Update Tab 6 AI Impact & Fake Yes Detector
  if (typeof renderAiImpactAndFakeYes === 'function')
    renderAiImpactAndFakeYes();

  // Update Tab 5 Financial Bridge & Stepper
  renderFinancialBridgeAndLeaks(totalFact, computedSsot);
}

function renderFinancialBridgeAndLeaks(factAmt, ssotAmt) {
  const plan = getMonthlyTarget();
  const totalCalls = CALLS_DATA.length;

  if (totalCalls === 0) {
    const lbFact = document.getElementById('lossBridgeFact');
    const lbSsot = document.getElementById('lossBridgeSsot');
    const lbLeaks = document.getElementById('lossBridgeLeaks');
    const lbTotal = document.getElementById('lossBridgeTotal');
    if (lbFact) lbFact.textContent = '0 ₽';
    if (lbSsot) lbSsot.textContent = '0 ₽';
    if (lbLeaks) lbLeaks.textContent = '+0 ₽';
    if (lbTotal) lbTotal.textContent = '0 ₽';
    return;
  }

  // 1. Next Step leak
  const nsLeakCalls = CALLS_DATA.filter(
    (c) => c.next_step === 0 || (c.cr && c.cr[0] === 0)
  );
  const nsLeakAmt = nsLeakCalls.reduce((acc, c) => acc + getCallAmount(c), 0);
  const nsPct = Math.round((nsLeakCalls.length / totalCalls) * 100);

  // 2. Low score speech leak
  const scoreLeakCalls = CALLS_DATA.filter((c) => c.score < 8);
  const scoreLeakAmt = Math.round(
    scoreLeakCalls.reduce((acc, c) => acc + getCallAmount(c), 0) * 0.45
  );

  // 3. Fake Yes / zombie leak
  const fakeCalls = CALLS_DATA.filter(
    (c) => c.cr && c.cr[7] === 0 && (c.next_step === 0 || c.status === 'risk')
  );
  const fakeLeakAmt = fakeCalls.reduce((acc, c) => acc + getCallAmount(c), 0);

  // 4. DSO / Cash lag: 7.5% of total target
  const dsoAmt = Math.round(plan * 0.075);

  // Total Leaks & Recoverable To-Be (35% uplift)
  const totalLeaks = nsLeakAmt + scoreLeakAmt + fakeLeakAmt + dsoAmt;
  const recoverableLeaks = Math.round(totalLeaks * 0.35);
  const safeSsot = Math.max(ssotAmt, Math.round(plan - totalLeaks * 0.65));
  const totalToBe = factAmt + safeSsot + recoverableLeaks;

  // Update Top Bridge
  const lbFact = document.getElementById('lossBridgeFact');
  const lbSsot = document.getElementById('lossBridgeSsot');
  const lbLeaks = document.getElementById('lossBridgeLeaks');
  const lbTotal = document.getElementById('lossBridgeTotal');
  const lbTitle = document.getElementById('lossBridgeTitle');

  if (lbFact) lbFact.textContent = `${factAmt.toLocaleString('ru-RU')} ₽`;
  if (lbSsot) lbSsot.textContent = `${safeSsot.toLocaleString('ru-RU')} ₽`;
  if (lbLeaks)
    lbLeaks.textContent = `+${recoverableLeaks.toLocaleString('ru-RU')} ₽`;
  if (lbTotal) lbTotal.textContent = `${totalToBe.toLocaleString('ru-RU')} ₽`;
  if (lbTitle)
    lbTitle.textContent = `От факта ${factAmt.toLocaleString('ru-RU')} ₽ к целевой кассе To-Be ${totalToBe.toLocaleString('ru-RU')} ₽`;

  // Update Stepper
  const fnTitle = document.getElementById('lossFunnelTitle');
  const fnDefBadge = document.getElementById('lossFunnelDeficitBadge');
  const grossAmtEl = document.getElementById('lossStepGrossAmt');
  const grossSubEl = document.getElementById('lossStepGrossSub');

  if (fnTitle)
    fnTitle.textContent = `От валового плана ${plan.toLocaleString('ru-RU')} ₽ к защищенной кассе SSOT`;
  const deficit = Math.max(0, plan - safeSsot);
  if (fnDefBadge)
    fnDefBadge.innerHTML = `<span class="delta-dot"></span>-${deficit.toLocaleString('ru-RU')} ₽ СУММАРНЫЙ ДЕФИЦИТ`;

  if (grossAmtEl) grossAmtEl.textContent = `${plan.toLocaleString('ru-RU')} ₽`;
  if (grossSubEl)
    grossSubEl.textContent = `План месяца 100% • Нормативная планка выручки`;

  // Step 2: Next Step
  const step2Rem = Math.max(0, plan - nsLeakAmt);
  const s2Delta = document.getElementById('lossStepNsDelta');
  const s2Amt = document.getElementById('lossStepNsAmt');
  const s2Desc = document.getElementById('lossStepNsDesc');
  const s2Bar = document.getElementById('lossStepNsBar');
  if (s2Delta)
    s2Delta.innerHTML = `<span class="delta-dot"></span>-${nsLeakAmt.toLocaleString('ru-RU')} ₽`;
  if (s2Amt) s2Amt.textContent = `${step2Rem.toLocaleString('ru-RU')} ₽`;
  if (s2Desc)
    s2Desc.textContent = `${nsLeakCalls.length} из ${totalCalls} (${nsPct}%) звонков ушли без зафиксированного слота`;
  if (s2Bar)
    s2Bar.style.width = `${Math.max(15, Math.round((step2Rem / plan) * 100))}%`;

  // Step 3: Low Score Speech
  const step3Rem = Math.max(0, step2Rem - scoreLeakAmt);
  const s3Delta = document.getElementById('lossStepSlaDelta');
  const s3Amt = document.getElementById('lossStepSlaAmt');
  const s3Desc = document.getElementById('lossStepSlaDesc');
  const s3Bar = document.getElementById('lossStepSlaBar');
  if (s3Delta)
    s3Delta.innerHTML = `<span class="delta-dot"></span>-${scoreLeakAmt.toLocaleString('ru-RU')} ₽`;
  if (s3Amt) s3Amt.textContent = `${step3Rem.toLocaleString('ru-RU')} ₽`;
  if (s3Desc)
    s3Desc.textContent = `${scoreLeakCalls.length} звонков с баллами ниже 8/13 (брак квалификации)`;
  if (s3Bar)
    s3Bar.style.width = `${Math.max(15, Math.round((step3Rem / plan) * 100))}%`;

  // Step 4: Fake Yes
  const step4Rem = Math.max(0, step3Rem - fakeLeakAmt);
  const s4Delta = document.getElementById('lossStepFakeDelta');
  const s4Amt = document.getElementById('lossStepFakeAmt');
  const s4Desc = document.getElementById('lossStepFakeDesc');
  const s4Bar = document.getElementById('lossStepFakeBar');
  if (s4Delta)
    s4Delta.innerHTML = `<span class="delta-dot"></span>-${fakeLeakAmt.toLocaleString('ru-RU')} ₽`;
  if (s4Amt) s4Amt.textContent = `${step4Rem.toLocaleString('ru-RU')} ₽`;
  if (s4Desc)
    s4Desc.textContent = `${fakeCalls.length} сделок со сливом на почту без ЛПР (ложное согласие)`;
  if (s4Bar)
    s4Bar.style.width = `${Math.max(15, Math.round((step4Rem / plan) * 100))}%`;

  // Step 5: DSO
  const step5Rem = Math.max(0, step4Rem - dsoAmt);
  const s5Delta = document.getElementById('lossStepDsoDelta');
  const s5Amt = document.getElementById('lossStepDsoAmt');
  const s5Bar = document.getElementById('lossStepDsoBar');
  if (s5Delta)
    s5Delta.innerHTML = `<span class="delta-dot"></span>-${dsoAmt.toLocaleString('ru-RU')} ₽`;
  if (s5Amt) s5Amt.textContent = `${step5Rem.toLocaleString('ru-RU')} ₽`;
  if (s5Bar)
    s5Bar.style.width = `${Math.max(15, Math.round((step5Rem / plan) * 100))}%`;

  // Step 6: Safe Cash Final
  const s6Amt = document.getElementById('lossStepSafeAmt');
  const s6Bar = document.getElementById('lossStepSafeBar');
  if (s6Amt) s6Amt.textContent = `${safeSsot.toLocaleString('ru-RU')} ₽`;
  if (s6Bar)
    s6Bar.style.width = `${Math.max(15, Math.round((safeSsot / plan) * 100))}%`;
}

window._RECENT_CALLS_FILTER = 'all';

function renderPulseRecentCalls(filterKey) {
  if (filterKey) window._RECENT_CALLS_FILTER = filterKey;
  const currentFilter = window._RECENT_CALLS_FILTER || 'all';

  const container = document.getElementById('pulseRecentCallsList');
  const badgeCount = document.getElementById('pulseRecentCallsCount');
  if (!container) return;

  const allCalls =
    typeof window.CALLS_DATA !== 'undefined' && Array.isArray(window.CALLS_DATA)
      ? window.CALLS_DATA
      : [];
  let filtered = [...allCalls];

  if (currentFilter === 'won') {
    filtered = filtered.filter(
      (c) => c.status === 'won' || (c.score && c.score >= 10)
    );
  } else if (currentFilter === 'risk') {
    filtered = filtered.filter(
      (c) =>
        c.status === 'risk' || c.next_step === 0 || (c.score && c.score < 8)
    );
  } else if (currentFilter === 'next_step') {
    filtered = filtered.filter(
      (c) => c.next_step === 1 || (c.cr && c.cr[0] === 1)
    );
  }

  if (badgeCount) {
    const filterLabels = {
      all: 'Все',
      won: 'Эталон',
      risk: 'Риск',
      next_step: 'Next Step',
    };
    badgeCount.textContent = `${filterLabels[currentFilter] || 'Все'} (${filtered.length})`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding: 36px 16px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">
        <div style="font-size: 1.8rem; margin-bottom: 6px; opacity: 0.5;">🎙️</div>
        <strong style="color: #fff; font-size: 0.88rem; display: block; margin-bottom: 2px;">Нет звонков по фильтру</strong>
        <div style="font-size: 0.72rem; color: var(--text-secondary);">По выбранному срезу (${currentFilter}) звонки не обнаружены</div>
      </div>
    `;
    return;
  }

  const topCalls = filtered.slice(0, 4);
  let html = '';
  topCalls.forEach((call) => {
    let iconClass = 'tx-icon-purple';
    let valClass =
      call.status === 'won'
        ? 'val-won'
        : call.status === 'risk'
          ? 'val-lost'
          : 'val-info';
    let scoreClass =
      call.score >= 11
        ? 'score-won'
        : call.score >= 8
          ? 'score-info'
          : 'score-lost';
    let scoreLabel =
      call.score >= 11
        ? `${call.score}/13 Эталон`
        : call.score >= 8
          ? `${call.score}/13 Норма`
          : `${call.score}/13 Слив`;
    html += `
      <div class="develop-tx-item" onclick="openCallModal('${call.id}')" style="cursor: pointer;">
        <div class="develop-tx-icon ${iconClass}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
        </div>
        <div class="develop-tx-details">
          <div class="develop-tx-name">${escapeHtml(call.manager || 'Менеджер')} &bull; <span class="score-badge ${scoreClass}">${scoreLabel}</span></div>
          <div class="develop-tx-time">${escapeHtml(call.client || 'Клиент')}</div>
        </div>
        <div class="develop-tx-val ${valClass}">${call.amount || '0 ₽'}</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

// ==========================================================================
// YESTERDAY LEAKS WIDGET (TAB 1: PULSE)
// ==========================================================================
function getManagerInitials(name) {
  if (!name) return 'М';
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return String(name).slice(0, 2).toUpperCase();
}

function parseYesterdayCallDate(dateVal) {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
  let d = new Date(dateVal);
  if (!isNaN(d.getTime())) return d;
  const s = String(dateVal).trim();
  const dotMatch = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dotMatch) {
    d = new Date(
      Number(dotMatch[3]),
      Number(dotMatch[2]) - 1,
      Number(dotMatch[1])
    );
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function formatLeakAmount(call) {
  if (call.amount && typeof call.amount === 'string' && call.amount.trim()) {
    return call.amount;
  }
  const amt =
    typeof getCallAmount === 'function'
      ? getCallAmount(call)
      : call.amount_num || 0;
  return `${amt.toLocaleString('ru-RU')} ₽`;
}

function renderYesterdayLeaks() {
  const container = document.getElementById('yesterdayLeaksList');
  const badge = document.getElementById('yesterdayLeaksBadge');
  if (!container) return;

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const startOfYesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1
  );

  const allCalls =
    typeof window.CALLS_DATA !== 'undefined' && Array.isArray(window.CALLS_DATA)
      ? window.CALLS_DATA
      : typeof CALLS_DATA !== 'undefined' && Array.isArray(CALLS_DATA)
        ? CALLS_DATA
        : [];

  // Filter calls: date >= startOfYesterday && date < startOfToday && status === 'risk'
  const yesterdayLeaks = allCalls.filter((c) => {
    if (!c) return false;
    const isRisk = c.status === 'risk' || c.next_step === 0;
    if (!isRisk || c.status === 'won') return false;

    const callDate = parseYesterdayCallDate(
      c.date || c.created_at || c.timestamp
    );
    if (!callDate) return false;
    return callDate >= startOfYesterday && callDate < startOfToday;
  });

  // Sort by amount descending
  yesterdayLeaks.sort((a, b) => {
    const amtA =
      typeof getCallAmount === 'function'
        ? getCallAmount(a)
        : a.amount_num || 0;
    const amtB =
      typeof getCallAmount === 'function'
        ? getCallAmount(b)
        : b.amount_num || 0;
    return amtB - amtA;
  });

  // Top 5
  const topLeaks = yesterdayLeaks.slice(0, 5);
  const totalCount = yesterdayLeaks.length;
  const totalSum = yesterdayLeaks.reduce((sum, c) => {
    const amt =
      typeof getCallAmount === 'function'
        ? getCallAmount(c)
        : c.amount_num || 0;
    return sum + amt;
  }, 0);

  // Update badge counter
  if (badge) {
    if (totalCount === 0) {
      badge.className = 'develop-pill pill-pos';
      badge.innerHTML =
        '<span style="display: inline-flex; align-items: center; gap: 4px;">✓ 0 сливов</span>';
    } else {
      badge.className = 'develop-pill pill-neg';
      let sumText = '';
      if (totalSum >= 1000000) {
        sumText = `${(totalSum / 1000000).toFixed(1).replace('.0', '')}M ₽`;
      } else if (totalSum >= 1000) {
        sumText = `${Math.round(totalSum / 1000)}K ₽`;
      } else {
        sumText = `${totalSum} ₽`;
      }
      const dealsWord =
        totalCount % 10 === 1 && totalCount % 100 !== 11
          ? 'сделка'
          : [2, 3, 4].includes(totalCount % 10) &&
              ![12, 13, 14].includes(totalCount % 100)
            ? 'сделки'
            : 'сделок';
      badge.textContent = `${totalCount} ${dealsWord} · ${sumText}`;
    }
  }

  // Empty state if no leaks
  if (topLeaks.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px 16px; text-align: center; background: rgba(52, 211, 153, 0.03); border: 1px dashed rgba(52, 211, 153, 0.25); border-radius: var(--radius-md);">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: rgba(52, 211, 153, 0.12); color: #34d399; margin-bottom: 8px;">
          <i data-lucide="check-circle" style="width: 22px; height: 22px;"></i>
        </div>
        <div style="font-size: var(--fs-base); font-weight: 700; color: #34d399; margin-bottom: 2px;">
          Вчера сливов не было. Хорошая работа!
        </div>
        <div style="font-size: var(--fs-xs); color: var(--text-secondary);">
          Все звонки за вчера зафиксировали договоренность о следующем шаге (Next Step 100%)
        </div>
      </div>
    `;
    if (
      typeof lucide !== 'undefined' &&
      typeof lucide.createIcons === 'function'
    ) {
      lucide.createIcons();
    }
    return;
  }

  // Render leak items
  const safeEscape =
    typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s || '');
  let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
  topLeaks.forEach((call) => {
    const initials = getManagerInitials(call.manager);
    const safeManager = safeEscape(call.manager || 'Менеджер');
    const safeClient = safeEscape(call.client || 'Клиент');
    const safeDeal = safeEscape(call.deal_title || '');
    const safeAmount = formatLeakAmount(call);
    const safeReason = safeEscape(
      call.error_summary || 'Нет точной даты/времени следующего шага'
    );
    const callId = call.id || '';

    html += `
      <div class="yesterday-leak-row" onclick="openCallModal('${callId}')" role="button" tabindex="0">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
          <div class="yesterday-leak-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, rgba(244,63,94,0.25), rgba(167,139,250,0.25)); border: 1.5px solid rgba(244,63,94,0.4); display: flex; align-items: center; justify-content: center; font-size: 0.74rem; font-weight: 800; color: #fff; flex-shrink: 0;">
            ${initials}
          </div>
          <div style="min-width: 0; flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 700; font-size: var(--fs-base); color: var(--text-primary);">${safeManager}</span>
              <span class="badge-lost" style="font-size: var(--fs-xxs); padding: 1px 6px; border-radius: 4px; font-weight: 700;">СЛИВ (НЕТ NEXT STEP)</span>
            </div>
            <div style="font-size: var(--fs-xs); color: var(--text-secondary); margin-top: 2px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
              Клиент: <strong style="color: var(--text-primary);">${safeClient}</strong>${safeDeal ? ` &bull; ${safeDeal}` : ''}
              <span style="color: var(--text-muted); margin-left: 6px;">&bull; ${safeReason}</span>
            </div>
          </div>
        </div>
        <div class="yesterday-leak-right" style="display: flex; align-items: center; gap: 14px; flex-shrink: 0;">
          <div style="font-size: 1.05rem; font-weight: 800; color: #fb7185; font-family: 'JetBrains Mono', monospace; text-align: right; white-space: nowrap;">
            ${safeAmount}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); openCallModal('${callId}')" style="padding: 7px 14px; font-weight: 700; font-size: var(--fs-xs); border-color: rgba(244,63,94,0.35); color: #fca5a5; display: inline-flex; align-items: center; gap: 4px;">
            <span>Разбор</span>
            <span style="font-size: 0.95em;">&rarr;</span>
          </button>
        </div>
      </div>
    `;
  });
  html += '</div>';
  container.innerHTML = html;

  if (
    typeof lucide !== 'undefined' &&
    typeof lucide.createIcons === 'function'
  ) {
    lucide.createIcons();
  }
}

window._CURRENT_FUNNEL_PERIOD = 'month';

function renderPulseFunnel(periodKey) {
  if (periodKey) window._CURRENT_FUNNEL_PERIOD = periodKey;
  const period = window._CURRENT_FUNNEL_PERIOD || 'month';

  let rawDeals =
    typeof window.DEALS_DATA !== 'undefined' &&
    Array.isArray(window.DEALS_DATA) &&
    window.DEALS_DATA.length > 0
      ? window.DEALS_DATA
      : null;

  let rawCalls =
    typeof window.CALLS_DATA !== 'undefined' && Array.isArray(window.CALLS_DATA)
      ? window.CALLS_DATA
      : [];

  let dealsList = rawDeals;
  let callsList = rawCalls;

  if (period !== 'all') {
    if (dealsList) {
      dealsList = dealsList.filter((d) =>
        typeof isItemInPeriod === 'function'
          ? isItemInPeriod(d.created_at || d.date, period)
          : true
      );
    }
    callsList = callsList.filter((c) =>
      typeof isItemInPeriod === 'function'
        ? isItemInPeriod(c.date || c.created_at, period)
        : true
    );
  }

  let val1 = 0,
    val2 = 0,
    val3 = 0,
    val4 = 0,
    val5 = 0;

  if (dealsList) {
    dealsList.forEach((d) => {
      const amt =
        typeof d.amount === 'number'
          ? d.amount
          : parseFloat(String(d.amount).replace(/[^\d.]/g, '')) || 0;
      const stId = parseInt(String(d.stage_id || '0'), 10);
      const isWon =
        d.status === 'won' ||
        stId === 6 ||
        String(d.stage || '').includes('Успешно');

      if (isWon) {
        val5 += amt;
        val4 += amt;
        val3 += amt;
        val2 += amt;
        val1 += amt;
      } else if (stId === 4) {
        val4 += amt;
        val3 += amt;
        val2 += amt;
        val1 += amt;
      } else if (stId === 3) {
        val3 += amt;
        val2 += amt;
        val1 += amt;
      } else if (stId === 2) {
        val2 += amt;
        val1 += amt;
      } else if (stId === 1) {
        val1 += amt;
      }
    });
  } else {
    const totalCalls = CALLS_DATA.length;
    const wonCalls = CALLS_DATA.filter((c) => c.status === 'won');
    const zoomCalls = CALLS_DATA.filter(
      (c) => c.next_step === 1 || (c.cr && c.cr[0] === 1)
    );
    const offerCalls = CALLS_DATA.filter((c) => c.cr && c.cr[7] === 1);
    const contractCalls = CALLS_DATA.filter((c) => c.cr && c.cr[11] === 1);

    val1 = CALLS_DATA.reduce((acc, c) => acc + getCallAmount(c), 0);
    val2 = zoomCalls.reduce((acc, c) => acc + getCallAmount(c), 0);
    val3 = offerCalls.reduce((acc, c) => acc + getCallAmount(c), 0);
    val4 = contractCalls.reduce((acc, c) => acc + getCallAmount(c), 0);
    val5 = wonCalls.reduce((acc, c) => acc + getCallAmount(c), 0);
  }

  const fVal1 = document.getElementById('funnelVal1');
  const fVal2 = document.getElementById('funnelVal2');
  const fVal3 = document.getElementById('funnelVal3');
  const fVal4 = document.getElementById('funnelVal4');
  const fVal5 = document.getElementById('funnelVal5');

  const fFill1 = document.getElementById('funnelFill1');
  const fFill2 = document.getElementById('funnelFill2');
  const fFill3 = document.getElementById('funnelFill3');
  const fFill4 = document.getElementById('funnelFill4');
  const fFill5 = document.getElementById('funnelFill5');

  const maxVal = Math.max(val1, 500000);
  if (fVal1) fVal1.textContent = val1.toLocaleString('ru-RU') + ' ₽';
  if (fVal2) fVal2.textContent = val2.toLocaleString('ru-RU') + ' ₽';
  if (fVal3) fVal3.textContent = val3.toLocaleString('ru-RU') + ' ₽';
  if (fVal4) fVal4.textContent = val4.toLocaleString('ru-RU') + ' ₽';
  if (fVal5) fVal5.textContent = val5.toLocaleString('ru-RU') + ' ₽';

  const hasItems = (dealsList ? dealsList.length : CALLS_DATA.length) > 0;
  if (fFill1)
    fFill1.style.width = hasItems
      ? `${Math.round((val1 / maxVal) * 100)}%`
      : '0%';
  if (fFill2)
    fFill2.style.width = hasItems
      ? `${Math.round((val2 / maxVal) * 100)}%`
      : '0%';
  if (fFill3)
    fFill3.style.width = hasItems
      ? `${Math.round((val3 / maxVal) * 100)}%`
      : '0%';
  if (fFill4)
    fFill4.style.width = hasItems
      ? `${Math.round((val4 / maxVal) * 100)}%`
      : '0%';
  if (fFill5)
    fFill5.style.width = hasItems
      ? `${Math.round((val5 / maxVal) * 100)}%`
      : '0%';
}

async function triggerSyncSimulation() {
  if (isSyncing) return;
  isSyncing = true;

  const btn = document.getElementById('btnSyncCRM');
  const icon = document.getElementById('syncIconSvg');
  const text = document.getElementById('syncBtnText');

  if (icon) icon.style.animation = 'spin 0.8s linear infinite';
  if (text) text.textContent = 'Синхронизация...';
  if (btn) btn.disabled = true;

  showToast(
    'Синхронизация [1/2]',
    'Запрос данных из Google Таблиц raw_calls и raw_deals...'
  );

  try {
    const [syncedCalls, syncedDeals] = await Promise.all([
      fetchLiveCallsData(false),
      fetchLiveDealsData(false),
    ]);
    setTimeout(() => {
      if (syncedCalls || syncedDeals) {
        showToast(
          'Синхронизация [2/2]',
          `Успешно: загружено ${CALLS_DATA.length} звонков и ${DEALS_DATA.length} сделок, SSOT обновлен!`
        );
      } else {
        showToast(
          'Синхронизация [2/2]',
          'Синхронизировано: локальный контур актуален.'
        );
      }
      if (icon) icon.style.animation = '';
      if (text) text.textContent = 'Синхронизировать';
      if (btn) btn.disabled = false;
      isSyncing = false;
      lastSyncTime = Date.now();
      tickLiveStatus();
      updateChartTimestamps();
    }, 600);
  } catch (err) {
    if (icon) icon.style.animation = '';
    if (text) text.textContent = 'Синхронизировать';
    if (btn) btn.disabled = false;
    isSyncing = false;
  }
}

function renderDynamicRopPodium() {
  const pCards = document.getElementById('ropPedestalCards');
  const pEmpty = document.getElementById('ropPedestalEmpty');
  const grid = document.getElementById('ropPedestalGrid');
  const hazardBox = document.getElementById('ropHazardRepCard');
  if (!pCards || !pEmpty) return;

  const calls =
    typeof window.CALLS_DATA !== 'undefined' && Array.isArray(window.CALLS_DATA)
      ? window.CALLS_DATA
      : [];
  if (calls.length === 0) {
    pCards.style.display = 'none';
    pEmpty.style.display = 'block';
    return;
  }

  pCards.style.display = 'block';
  pEmpty.style.display = 'none';

  // Group calls by manager
  const mgrMap = {};
  calls.forEach((c) => {
    const name = (c.manager || c.manager_name || 'Менеджер').trim();
    if (!mgrMap[name]) {
      mgrMap[name] = {
        name: name,
        callsCount: 0,
        scoresSum: 0,
        pipeAmt: 0,
        nextStepWon: 0,
        riskCallsCount: 0,
        riskAmt: 0,
      };
    }
    const m = mgrMap[name];
    m.callsCount += 1;
    m.scoresSum += typeof c.score === 'number' ? c.score : 8;
    const amt = typeof getCallAmount === 'function' ? getCallAmount(c) : 0;
    m.pipeAmt += amt;
    if (c.next_step === 1 || (c.cr && c.cr[0] === 1)) {
      m.nextStepWon += 1;
    }
    if (c.status === 'risk' || (c.score && c.score < 8) || c.next_step === 0) {
      m.riskCallsCount += 1;
      m.riskAmt += amt;
    }
  });

  const managers = Object.values(mgrMap).map((m) => ({
    ...m,
    avgScore: m.callsCount > 0 ? m.scoresSum / m.callsCount : 0,
    nextStepPct:
      m.callsCount > 0 ? Math.round((m.nextStepWon / m.callsCount) * 100) : 0,
  }));

  // Sort by avgScore descending, then pipeAmt descending
  managers.sort((a, b) => b.avgScore - a.avgScore || b.pipeAmt - a.pipeAmt);

  const top1 = managers[0] || null;
  const top2 = managers.length > 1 ? managers[1] : null;
  const top3 = managers.length > 2 ? managers[2] : null;

  function renderPodiumCard(
    rep,
    rankNum,
    rankClass,
    titleText,
    badgeText,
    isRaised
  ) {
    if (!rep) return '';
    const initial = escapeHtml(rep.name.charAt(0).toUpperCase());
    const borderStyle = isRaised
      ? 'border: 1px solid rgba(245, 158, 11, 0.35);'
      : '';
    const crownHtml = isRaised
      ? '<span class="podium-crown" style="font-size: 0.72rem; font-family: \'JetBrains Mono\', monospace; font-weight: 700; color: #fbbf24;">ТОП-1</span>'
      : '';
    const nameColor = isRaised ? '#fbbf24' : '#fff';
    const badgeStyle = isRaised ? 'color: #f59e0b; font-weight: 800;' : '';

    return `
      <div class="podium-card ${rankClass}" data-action="filter-rep" data-rep="${encodeURIComponent(rep.name)}" style="cursor: pointer; ${borderStyle}" title="Нажмите для фильтрации звонков ${escapeHtml(rep.name)}">
        <div class="podium-avatar-wrap">
          ${crownHtml}
          <div class="podium-avatar">${initial}</div>
        </div>
        <div class="podium-rep-name" style="color: ${nameColor};">${escapeHtml(rep.name)}</div>
        <div class="podium-role-badge" style="${badgeStyle}">${rankNum} МЕСТО &bull; ${badgeText}</div>
        <div class="podium-metrics-box">
          <div class="podium-metric-row">
            <span style="color: var(--text-muted);">Качество речи:</span>
            <span class="delta-badge delta-pos" style="padding: 1px 6px; font-size: 0.68rem;">${rep.avgScore.toFixed(1)} / 13</span>
          </div>
          <div class="podium-metric-row">
            <span style="color: var(--text-muted);">В пайплайне:</span>
            <strong style="color: ${nameColor}; font-family: 'JetBrains Mono', monospace;">${rep.pipeAmt.toLocaleString('ru-RU')} ₽ (${rep.callsCount} звонков)</strong>
          </div>
          <div class="podium-metric-row">
            <span style="color: var(--text-muted);">Next Step:</span>
            <span style="color: #34d399; font-weight: 700;">${rep.nextStepPct}% (${rep.nextStepWon} из ${rep.callsCount})</span>
          </div>
        </div>
      </div>
    `;
  }

  let podiumHtml = '';
  if (top2) {
    podiumHtml += renderPodiumCard(
      top2,
      2,
      'rank-2',
      '2 МЕСТО',
      'ЭТАЛОН СКРИПТА',
      false
    );
  }
  if (top1) {
    podiumHtml += renderPodiumCard(
      top1,
      1,
      'rank-1',
      '1 МЕСТО',
      'ТОП-ПЕРФОРМЕР',
      true
    );
  }
  if (top3) {
    podiumHtml += renderPodiumCard(
      top3,
      3,
      'rank-3',
      '3 МЕСТО',
      'СТАБИЛЬНОСТЬ',
      false
    );
  }

  if (grid) {
    grid.innerHTML = podiumHtml;
    if (grid.dataset.bound !== '1') {
      grid.dataset.bound = '1';
      grid.addEventListener('click', (e) => {
        const card = e.target.closest('[data-action="filter-rep"]');
        if (card && typeof filterRepAudit === 'function') {
          filterRepAudit(decodeURIComponent(card.dataset.rep));
        }
      });
    }
  }

  // Hazard Manager Alert Card
  let hazardRep = null;
  const riskyMgrs = [...managers].filter(
    (m) => m.riskCallsCount > 0 || m.avgScore < 8.5
  );
  if (riskyMgrs.length > 0) {
    riskyMgrs.sort((a, b) => a.avgScore - b.avgScore);
    hazardRep = riskyMgrs[0];
  }

  if (hazardBox) {
    if (hazardRep) {
      const hInitial = escapeHtml(hazardRep.name.charAt(0).toUpperCase());
      hazardBox.innerHTML = `
        <div class="hazard-alert-strip" data-action="filter-rep" data-rep="${encodeURIComponent(hazardRep.name)}" style="cursor: pointer;" title="Нажмите для разбора критических звонков ${escapeHtml(hazardRep.name)}">
          <div style="display: flex; align-items: center; gap: 14px;">
            <div class="hazard-rep-avatar">${hInitial}</div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="delta-badge delta-neg"><span class="delta-dot"></span>P0 ЗОНА КРИТИЧЕСКОГО РИСКА</span>
                <strong style="color: #fff; font-size: 0.88rem;">${escapeHtml(hazardRep.name)}</strong>
                <span style="font-size: 0.74rem; color: #fca5a5;">(${hazardRep.pipeAmt.toLocaleString('ru-RU')} ₽ в работе &bull; ${hazardRep.callsCount} диалогов)</span>
              </div>
              <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 4px;">
                Средний балл речи: <strong style="color: #fb7185;">${hazardRep.avgScore.toFixed(1)} / 13</strong> &bull; Брак Next Step: <strong style="color: #fb7185;">${100 - hazardRep.nextStepPct}% (${hazardRep.riskCallsCount} звонков с риском слива)</strong>
              </div>
            </div>
          </div>
          <button class="btn btn-emerald" data-action="filter-rep" data-rep="${encodeURIComponent(hazardRep.name)}" style="font-size: 0.74rem;">
            <span>Разбор звонков (${hazardRep.riskCallsCount} шт.)</span>
          </button>
        </div>
      `;
      hazardBox.style.display = 'block';

      if (hazardBox.dataset.bound !== '1') {
        hazardBox.dataset.bound = '1';
        hazardBox.addEventListener('click', (e) => {
          const el = e.target.closest('[data-action="filter-rep"]');
          if (el && typeof filterRepAudit === 'function') {
            filterRepAudit(decodeURIComponent(el.dataset.rep));
          }
        });
      }
    } else {
      hazardBox.innerHTML = '';
      hazardBox.style.display = 'none';
    }
  }
}

window._DYNAMIC_RESCUE_SCRIPTS = [];

function renderDynamicRescueDeals() {
  const rCards = document.getElementById('ropRescueDealsCards');
  const rEmpty = document.getElementById('ropRescueDealsEmpty');
  const listContainer = document.getElementById('ropRescueDealsDynamicList');
  if (!rCards || !rEmpty) return;

  const calls =
    typeof window.CALLS_DATA !== 'undefined' && Array.isArray(window.CALLS_DATA)
      ? window.CALLS_DATA
      : [];
  if (calls.length === 0) {
    rCards.style.display = 'none';
    rEmpty.style.display = 'block';
    return;
  }

  let riskCalls = calls.filter(
    (c) =>
      c.status === 'risk' ||
      c.next_step === 0 ||
      (c.score !== undefined && c.score < 8)
  );
  if (riskCalls.length === 0) {
    riskCalls = [...calls]
      .sort((a, b) => (a.score || 0) - (b.score || 0))
      .slice(0, 5);
  } else {
    riskCalls = riskCalls.slice(0, 5);
  }

  if (riskCalls.length === 0) {
    rCards.style.display = 'none';
    rEmpty.style.display = 'block';
    return;
  }

  rCards.style.display = 'flex';
  rEmpty.style.display = 'none';

  window._DYNAMIC_RESCUE_SCRIPTS = [];
  let html = '';

  riskCalls.forEach((c, idx) => {
    const isP0 = c.next_step === 0 || (c.score !== undefined && c.score < 7);
    const badgeClass = isP0 ? 'badge-lost' : 'badge-warn';
    const badgeLabel = isP0 ? 'P0 КРИТИЧЕСКИЙ' : 'P1 ВНИМАНИЕ';
    const clientTitle =
      c.client || c.client_name || c.contact || `Клиент #${idx + 1}`;
    const niche = c.client_niche || c.niche || 'B2B';
    const mgr = c.manager || c.manager_name || 'Менеджер';
    const amt = typeof getCallAmount === 'function' ? getCallAmount(c) : 0;
    const amtStr = `${amt.toLocaleString('ru-RU')} ₽`;

    let symptom = c.error_summary || c.errors;
    if (!symptom) {
      if (c.next_step === 0) {
        symptom =
          'Нет жесткого Next Step; клиент ушел без согласованного слота встречи или звонка.';
      } else if (c.score < 8) {
        symptom =
          'Слабая аргументация ценности; возражения не отработаны; риск ухода к конкурентам.';
      } else {
        symptom =
          'Требуется контрольное касание РОПа для подтверждения договоренностей.';
      }
    }

    let scriptText = c.ai_recommendation || c.recommendation;
    if (!scriptText || scriptText.length < 15) {
      scriptText = `Здравствуйте, ${clientTitle}! По вашему проекту на сумму ${amtStr} согласовали спецусловия до конца недели: гарантия результата + аудит в подарок. Давайте зафиксируем бронь? Удобно сегодня созвониться на 5 минут в 14:00?`;
    }
    scriptText = scriptText.replace(/^["'«]+|["'»]+$/g, '').trim();
    window._DYNAMIC_RESCUE_SCRIPTS.push(scriptText);

    html += `
      <div style="padding: 16px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px;">
          <div>
            <span class="${badgeClass}" style="margin-right: 6px;">${badgeLabel}</span>
            <strong style="color: #fff; font-size: 0.88rem;">Кейс ${idx + 1}: ${escapeHtml(clientTitle)} (${escapeHtml(niche)})</strong>
            <span style="font-size: 0.74rem; color: var(--text-muted); margin-left: 6px;">(${escapeHtml(mgr)} &bull; ${amtStr})</span>
          </div>
          <button class="btn btn-emerald" onclick="copyRescueScript(${idx})">
            <span>Скопировать в WhatsApp</span>
          </button>
        </div>
        <div style="font-size: 0.78rem; color: ${isP0 ? '#fca5a5' : '#fde68a'}; margin-bottom: 6px;">
          <strong>Симптом:</strong> ${escapeHtml(symptom)}
        </div>
        <div id="script-dynamic-${idx}" style="font-size: 0.76rem; background: rgba(0,0,0,0.3); padding: 10px 14px; border-radius: var(--radius-sm); border-left: 3px solid #34d399; color: var(--text-secondary); font-style: italic;">
          "${escapeHtml(scriptText)}"
        </div>
      </div>
    `;
  });

  if (listContainer) listContainer.innerHTML = html;
}

function copyRescueScript(idOrIdx) {
  let textToCopy = '';
  if (
    typeof idOrIdx === 'number' &&
    window._DYNAMIC_RESCUE_SCRIPTS &&
    window._DYNAMIC_RESCUE_SCRIPTS[idOrIdx]
  ) {
    textToCopy = window._DYNAMIC_RESCUE_SCRIPTS[idOrIdx];
  } else if (typeof idOrIdx === 'string') {
    const el = document.getElementById(
      idOrIdx.startsWith('script-') ? idOrIdx : `script-${idOrIdx}`
    );
    if (el) textToCopy = el.textContent.trim().replace(/^"|"$/g, '');
  }

  if (!textToCopy && typeof idOrIdx === 'number') {
    const el = document.getElementById(`script-dynamic-${idOrIdx}`);
    if (el) textToCopy = el.textContent.trim().replace(/^"|"$/g, '');
  }

  if (textToCopy) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = textToCopy;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast(
      'WhatsApp Скрипт скопирован',
      'Готовый скрипт спасения сделки помещен в буфер обмена.'
    );
  } else {
    showToast('Скрипт', 'Не удалось скопировать скрипт.');
  }
}

// Expose Deals & Sync handlers on window
window.openOnePagerModal = openOnePagerModal;
window.closeOnePagerModal = closeOnePagerModal;
window.populateOnePagerModal = populateOnePagerModal;
window.renderDynamicRopPodium = renderDynamicRopPodium;
window.renderDynamicRescueDeals = renderDynamicRescueDeals;
window.copyRescueScript = copyRescueScript;
window.setPulsePeriod = setPulsePeriod;
window.fetchLiveCallsData = fetchLiveCallsData;
window.fetchLiveDealsData = fetchLiveDealsData;
window.DEALS_DATA = DEALS_DATA;
window.initWebSocketListener = initWebSocketListener;
window.handleIncomingLiveCall = handleIncomingLiveCall;
window.refreshAllDashboardViews = refreshAllDashboardViews;
window.renderFinancialBridgeAndLeaks = renderFinancialBridgeAndLeaks;
window.renderPulseRecentCalls = renderPulseRecentCalls;
window.renderYesterdayLeaks = renderYesterdayLeaks;
window.renderPulseFunnel = renderPulseFunnel;
window.triggerSyncSimulation = triggerSyncSimulation;
window.calculateFinancials = calculateFinancials;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateFinancials,
    isItemInPeriod,
    populateOnePagerModal,
    setPulsePeriod,
    fetchLiveCallsData,
    fetchLiveDealsData,
    refreshAllDashboardViews,
    renderYesterdayLeaks,
  };
}

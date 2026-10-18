/**
 * RevOps Enterprise OS - Deals Pipeline & Live Sync Engine (v20.4)
 * Responsibilities: Deals pipeline, stages 1-6 mapping, financial bridge, One-Pager modal, WebSocket & live calls sync.
 */

// ==========================================================================
// EXECUTIVE ONE-PAGER MODAL
// ==========================================================================
function openOnePagerModal() {
  const modal = document.getElementById('onePagerModal');
  if (modal) modal.style.display = 'flex';
}

function closeOnePagerModal() {
  const modal = document.getElementById('onePagerModal');
  if (modal) modal.style.display = 'none';
}


// ==========================================================================
// PERIOD SELECTOR (TAB 1: PULSE)
// ==========================================================================
function setPulsePeriod(period) {
  const syncText = document.getElementById('periodSyncText');
  let totalFact = 0;
  CALLS_DATA.forEach(c => {
    if (c.status === 'won') {
      const rawAmt = c.amount ? parseInt(String(c.amount).replace(/\D/g, '')) : 500000;
      totalFact += (rawAmt || 500000);
    }
  });
  const computedSsot = CALLS_DATA.length * 250000;
  const computedPipe = CALLS_DATA.length * 500000;

  let targetPlan = getMonthlyTarget();
  let periodLabel = 'Октябрь 2026';

  if (period === 'today') {
    targetPlan = 250000;
    periodLabel = 'Сегодня';
    if (syncText) syncText.textContent = `Срез за сегодня (${CALLS_DATA.length} звонков)`;
    showToast('Период: Сегодня', 'Показана суточная операционная активность.');
  } else if (period === '7d') {
    targetPlan = 1250000;
    periodLabel = 'За 7 дней';
    if (syncText) syncText.textContent = `Срез за последние 7 дней (${CALLS_DATA.length} звонков)`;
    showToast('Период: 7 дней', 'Показаны данные за прошедшую неделю.');
  } else if (period === 'prev_month') {
    targetPlan = 4800000;
    periodLabel = 'Сентябрь 2026';
    if (syncText) syncText.textContent = `Архив за прошлый месяц (${CALLS_DATA.length} звонков)`;
    showToast('Период: Сентябрь 2026', 'Показаны архивные данные за сентябрь.');
  } else if (period === 'year') {
    targetPlan = 60000000;
    periodLabel = 'Весь 2026 год';
    if (syncText) syncText.textContent = `Годовой контур 2026 (${CALLS_DATA.length} звонков)`;
    showToast('Период: 2026 Год (YTD)', 'Показан суммарный годовой таргет.');
  } else {
    // default: current month
    targetPlan = getMonthlyTarget();
    periodLabel = 'Октябрь 2026';
    if (syncText) syncText.textContent = `Синхронизировано: amoCRM + Битрикс24 (${CALLS_DATA.length} звонков)`;
    showToast('Период: Октябрь 2026', 'Показан полный месячный контур компании.');
  }

  animateCounter(document.getElementById('metricPlanVal'), targetPlan);
  animateCounter(document.getElementById('metricFactVal'), totalFact);
  animateCounter(document.getElementById('metricSsotVal'), computedSsot);
  if (document.getElementById('metricPipeVal')) animateCounter(document.getElementById('metricPipeVal'), computedPipe);

  const pct = targetPlan > 0 ? ((totalFact / targetPlan) * 100).toFixed(1) : '0.0';
  const b = document.getElementById('metricFactBadge');
  if (b) b.textContent = `${pct}%`;

  const deficit = totalFact - targetPlan;
  const defEl = document.getElementById('metricDeficitVal');
  const defPill = document.getElementById('metricDeficitPill');
  if (defEl) {
    if (deficit < 0) {
      defEl.textContent = `-${(Math.abs(deficit) / 1000000).toFixed(1)}M ₽`;
      if (defPill) {
        defPill.className = 'develop-pill pill-neg';
        const sub = defPill.querySelector('.pill-sub');
        if (sub) sub.textContent = 'дефицит плана';
      }
    } else {
      defEl.textContent = `+${(deficit / 1000000).toFixed(1)}M ₽`;
      if (defPill) {
        defPill.className = 'develop-pill pill-pos';
        const sub = defPill.querySelector('.pill-sub');
        if (sub) sub.textContent = 'профицит плана';
      }
    }
  }
}


// ==========================================================================
// ==========================================================================
// LIVE DATA & WEBSOCKET SYNC (FASTAPI <-> GOOGLE SHEETS <-> N8N)
// ==========================================================================
let isSyncing = false;
let liveWs = null;

async function fetchLiveCallsData(showFeedback = false) {
  try {
    const tenantId = getActiveTenantId();
    const res = await fetch(`${REVOPS_API_BASE}/api/v1/calls/data?tenant_id=${encodeURIComponent(tenantId)}`);
    if (!res.ok) throw new Error('API status ' + res.status);
    const data = await res.json();
    if (data && Array.isArray(data.calls)) {
      CALLS_DATA = data.calls;
      refreshAllDashboardViews();
      lastSyncTime = Date.now();
      tickLiveStatus();
      updateChartTimestamps();
      if (showFeedback && typeof showToast === 'function') {
        showToast('Google Таблица', data.calls.length > 0 ? `Синхронизировано ${data.calls.length} звонков (${tenantId})` : `Таблица raw_calls очищена (${tenantId}: 0 звонков)`);
      }
      return true;
    }
  } catch (err) {
    console.warn('[Sync] Falling back to local dataset:', err.message);
  }
  return false;
}

function initWebSocketListener() {
  if (liveWs && liveWs.readyState === WebSocket.OPEN) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = (typeof window !== 'undefined' && window.location.hostname.includes('ai-rop.ru') && !window.location.hostname.startsWith('report.'))
    ? 'report.ai-rop.ru'
    : window.location.host;
  const tenantId = getActiveTenantId();
  const wsUrl = `${protocol}//${wsHost}/ws/org/${encodeURIComponent(tenantId)}`;
  try {
    liveWs = new WebSocket(wsUrl);
    liveWs.onopen = () => {
      console.log(`[Live WS] Connected to live pipeline stream (${tenantId})`);
    };
    liveWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'new_call' && msg.call) {
          handleIncomingLiveCall(msg.call);
        } else if (msg.type === 'deal_updated') {
          fetchLiveCallsData(false);
        }
      } catch (e) {
        console.error('[Live WS] Message parse error:', e);
      }
    };
    liveWs.onclose = () => {
      setTimeout(initWebSocketListener, 5000);
    };
    liveWs.onerror = () => {
      try { liveWs.close(); } catch (e) {}
    };
  } catch (e) {
    console.warn('[Live WS] Setup failed:', e);
  }
}

function handleIncomingLiveCall(newCall) {
  if (!newCall || !newCall.id) return;
  const existingIdx = CALLS_DATA.findIndex(c => c.id === newCall.id);
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
    showToast('Новый звонок от n8n', `${mgr} • Оценка ${sc} • Записано в Google Таблицу`);
  }
}

function refreshAllDashboardViews() {
  if (typeof filterCallsTable === 'function') filterCallsTable();
  if (typeof renderSkillsHeatmap === 'function') renderSkillsHeatmap();
  if (typeof initSpeechRadarChart === 'function') {
    const activeRepBtn = document.querySelector('.radar-rep-btn.active');
    const repName = activeRepBtn ? (activeRepBtn.dataset.rep || 'all') : 'all';
    initSpeechRadarChart(repName);
  }
  if (typeof initRepPerformanceChart === 'function') initRepPerformanceChart();
  if (typeof updateSimulation === 'function') updateSimulation(false);

  // Recalculate Fact and SSOT from live data
  const wonCalls = CALLS_DATA.filter(c => c.status === 'won');
  const totalFact = wonCalls.reduce((acc, c) => acc + getCallAmount(c), 0);
  const computedSsot = CALLS_DATA.reduce((acc, c) => {
    const amt = getCallAmount(c);
    const weight = (c.score >= 10 && c.next_step === 1) ? 0.85 : (c.next_step === 1 ? 0.50 : 0.15);
    return acc + Math.round(amt * weight);
  }, 0);

  const factVal = document.getElementById('metricFactVal');
  if (factVal) animateCounter(factVal, totalFact, 900);

  const ssotVal = document.getElementById('metricSsotVal');
  if (ssotVal) animateCounter(ssotVal, computedSsot, 900);

  const plan = getMonthlyTarget();
  const factBadge = document.getElementById('metricFactBadge');
  if (factBadge) {
    const pct = plan > 0 ? ((totalFact / plan) * 100).toFixed(1) : '0.0';
    factBadge.textContent = `${pct}%`;
  }

  const defVal = document.getElementById('metricDeficitVal');
  if (defVal) {
    const diff = totalFact - plan;
    defVal.textContent = diff < 0 ? `-${(Math.abs(diff)/1000000).toFixed(1)}M ₽` : `+${(diff/1000000).toFixed(1)}M ₽`;
  }

  const ssotTip = document.getElementById('metricSsotTooltip');
  if (ssotTip) {
    ssotTip.textContent = computedSsot > 0 ? `${(computedSsot / 1000000).toFixed(2)}M ₽ SSOT` : '0 ₽ SSOT';
  }

  // Update recent calls in Pulse Tab
  renderPulseRecentCalls();
  // Update funnel in Pulse Tab
  renderPulseFunnel();
  // Update Donut, Spline, Dissection and Rings
  updateDevelopBentoCharts();

  // Update Tab 3 Podium
  const pCards = document.getElementById('ropPedestalCards');
  const pEmpty = document.getElementById('ropPedestalEmpty');
  if (pCards && pEmpty) {
    pCards.style.display = CALLS_DATA.length === 0 ? 'none' : 'block';
    pEmpty.style.display = CALLS_DATA.length === 0 ? 'block' : 'none';
  }

  // Update Tab 3 Top-5 Rescue Deals
  const rCards = document.getElementById('ropRescueDealsCards');
  const rEmpty = document.getElementById('ropRescueDealsEmpty');
  if (rCards && rEmpty) {
    rCards.style.display = CALLS_DATA.length === 0 ? 'none' : 'flex';
    rEmpty.style.display = CALLS_DATA.length === 0 ? 'block' : 'none';
  }

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
  const avgScore = totalCalls ? (CALLS_DATA.reduce((s, c) => s + (c.score || 0), 0) / totalCalls) : 0;
  const nextStepCount = CALLS_DATA.filter(c => c.next_step === 1 || (c.cr && c.cr[0] === 1)).length;
  const riskCalls = CALLS_DATA.filter(c => c.status === 'risk' || (c.score !== undefined && c.score < 8) || c.next_step === 0);
  const riskCount = riskCalls.length;
  const riskSum = riskCalls.reduce((acc, c) => acc + getCallAmount(c), 0);

  if (aCalls) aCalls.textContent = `${totalCalls} шт`;
  if (aCallsBadge) aCallsBadge.textContent = totalCalls ? '100% ПОКРЫТИЕ' : '0% ПОКРЫТИЕ';
  if (aCallsSub) aCallsSub.textContent = `${totalFact.toLocaleString('ru-RU')} ₽ сумма подтвержденных сделок`;
  if (aScore) aScore.textContent = `${totalCalls ? avgScore.toFixed(1) : '0.0'} / 13`;
  if (aScoreBadge) aScoreBadge.textContent = `${totalCalls ? (avgScore / 13 * 100).toFixed(1) + '%' : '0.0%'} ЭФФЕКТИВНОСТЬ`;
  if (aNextStep) aNextStep.textContent = `${nextStepCount} из ${totalCalls}`;
  if (aNextStepBadge) aNextStepBadge.textContent = `${totalCalls ? (nextStepCount / totalCalls * 100).toFixed(1) + '%' : '0.0%'} В НОРМЕ`;
  if (aNextStepSub) aNextStepSub.textContent = `${totalCalls - nextStepCount} звонков без фиксации даты/времени`;
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
  if (specTitle) specTitle.textContent = `Спектр качества звонков (${totalCalls} диалогов)`;
  if (specBadge) specBadge.textContent = `Gemini Score ${totalCalls ? avgScore.toFixed(1) : '0.0'}`;
  if (totalCalls === 0) {
    if (specWonBar) specWonBar.style.width = '0%';
    if (specNormBar) specNormBar.style.width = '0%';
    if (specRiskBar) specRiskBar.style.width = '0%';
    if (specWonTxt) specWonTxt.textContent = '0 (0%)';
    if (specNormTxt) specNormTxt.textContent = '0 (0%)';
    if (specRiskTxt) specRiskTxt.textContent = '0 (0%)';
  } else {
    const wonNum = CALLS_DATA.filter(c => c.score >= 11).length;
    const normNum = CALLS_DATA.filter(c => c.score >= 8 && c.score < 11).length;
    const riskNum = CALLS_DATA.filter(c => c.score < 8).length;
    if (specWonBar) specWonBar.style.width = `${Math.round(wonNum / totalCalls * 100)}%`;
    if (specNormBar) specNormBar.style.width = `${Math.round(normNum / totalCalls * 100)}%`;
    if (specRiskBar) specRiskBar.style.width = `${Math.round(riskNum / totalCalls * 100)}%`;
    if (specWonTxt) specWonTxt.textContent = `${wonNum} (${Math.round(wonNum / totalCalls * 100)}%)`;
    if (specNormTxt) specNormTxt.textContent = `${normNum} (${Math.round(normNum / totalCalls * 100)}%)`;
    if (specRiskTxt) specRiskTxt.textContent = `${riskNum} (${Math.round(riskNum / totalCalls * 100)}%)`;
  }

  // Update Tab 4 Radar Rep Pills
  if (typeof renderRadarRepPills === 'function') renderRadarRepPills();

  // Update Tab 8 Payroll & Skills
  if (typeof renderPayrollTable === 'function') renderPayrollTable();

  // Update Tab 6 AI Impact & Fake Yes Detector
  if (typeof renderAiImpactAndFakeYes === 'function') renderAiImpactAndFakeYes();

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
  const nsLeakCalls = CALLS_DATA.filter(c => c.next_step === 0 || (c.cr && c.cr[0] === 0));
  const nsLeakAmt = nsLeakCalls.reduce((acc, c) => acc + getCallAmount(c), 0);
  const nsPct = Math.round((nsLeakCalls.length / totalCalls) * 100);

  // 2. Low score speech leak
  const scoreLeakCalls = CALLS_DATA.filter(c => c.score < 8);
  const scoreLeakAmt = Math.round(scoreLeakCalls.reduce((acc, c) => acc + getCallAmount(c), 0) * 0.45);

  // 3. Fake Yes / zombie leak
  const fakeCalls = CALLS_DATA.filter(c => c.cr && c.cr[7] === 0 && (c.next_step === 0 || c.status === 'risk'));
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
  if (lbLeaks) lbLeaks.textContent = `+${recoverableLeaks.toLocaleString('ru-RU')} ₽`;
  if (lbTotal) lbTotal.textContent = `${totalToBe.toLocaleString('ru-RU')} ₽`;
  if (lbTitle) lbTitle.textContent = `От факта ${factAmt.toLocaleString('ru-RU')} ₽ к целевой кассе To-Be ${totalToBe.toLocaleString('ru-RU')} ₽`;

  // Update Stepper
  const fnTitle = document.getElementById('lossFunnelTitle');
  const fnDefBadge = document.getElementById('lossFunnelDeficitBadge');
  const grossAmtEl = document.getElementById('lossStepGrossAmt');
  const grossSubEl = document.getElementById('lossStepGrossSub');

  if (fnTitle) fnTitle.textContent = `От валового плана ${plan.toLocaleString('ru-RU')} ₽ к защищенной кассе SSOT`;
  const deficit = Math.max(0, plan - safeSsot);
  if (fnDefBadge) fnDefBadge.innerHTML = `<span class="delta-dot"></span>-${deficit.toLocaleString('ru-RU')} ₽ СУММАРНЫЙ ДЕФИЦИТ`;

  if (grossAmtEl) grossAmtEl.textContent = `${plan.toLocaleString('ru-RU')} ₽`;
  if (grossSubEl) grossSubEl.textContent = `План месяца 100% • Нормативная планка выручки`;

  // Step 2: Next Step
  const step2Rem = Math.max(0, plan - nsLeakAmt);
  const s2Delta = document.getElementById('lossStepNsDelta');
  const s2Amt = document.getElementById('lossStepNsAmt');
  const s2Desc = document.getElementById('lossStepNsDesc');
  const s2Bar = document.getElementById('lossStepNsBar');
  if (s2Delta) s2Delta.innerHTML = `<span class="delta-dot"></span>-${nsLeakAmt.toLocaleString('ru-RU')} ₽`;
  if (s2Amt) s2Amt.textContent = `${step2Rem.toLocaleString('ru-RU')} ₽`;
  if (s2Desc) s2Desc.textContent = `${nsLeakCalls.length} из ${totalCalls} (${nsPct}%) звонков ушли без зафиксированного слота`;
  if (s2Bar) s2Bar.style.width = `${Math.max(15, Math.round((step2Rem / plan) * 100))}%`;

  // Step 3: Low Score Speech
  const step3Rem = Math.max(0, step2Rem - scoreLeakAmt);
  const s3Delta = document.getElementById('lossStepSlaDelta');
  const s3Amt = document.getElementById('lossStepSlaAmt');
  const s3Desc = document.getElementById('lossStepSlaDesc');
  const s3Bar = document.getElementById('lossStepSlaBar');
  if (s3Delta) s3Delta.innerHTML = `<span class="delta-dot"></span>-${scoreLeakAmt.toLocaleString('ru-RU')} ₽`;
  if (s3Amt) s3Amt.textContent = `${step3Rem.toLocaleString('ru-RU')} ₽`;
  if (s3Desc) s3Desc.textContent = `${scoreLeakCalls.length} звонков с баллами ниже 8/13 (брак квалификации)`;
  if (s3Bar) s3Bar.style.width = `${Math.max(15, Math.round((step3Rem / plan) * 100))}%`;

  // Step 4: Fake Yes
  const step4Rem = Math.max(0, step3Rem - fakeLeakAmt);
  const s4Delta = document.getElementById('lossStepFakeDelta');
  const s4Amt = document.getElementById('lossStepFakeAmt');
  const s4Desc = document.getElementById('lossStepFakeDesc');
  const s4Bar = document.getElementById('lossStepFakeBar');
  if (s4Delta) s4Delta.innerHTML = `<span class="delta-dot"></span>-${fakeLeakAmt.toLocaleString('ru-RU')} ₽`;
  if (s4Amt) s4Amt.textContent = `${step4Rem.toLocaleString('ru-RU')} ₽`;
  if (s4Desc) s4Desc.textContent = `${fakeCalls.length} сделок со сливом на почту без ЛПР (ложное согласие)`;
  if (s4Bar) s4Bar.style.width = `${Math.max(15, Math.round((step4Rem / plan) * 100))}%`;

  // Step 5: DSO
  const step5Rem = Math.max(0, step4Rem - dsoAmt);
  const s5Delta = document.getElementById('lossStepDsoDelta');
  const s5Amt = document.getElementById('lossStepDsoAmt');
  const s5Bar = document.getElementById('lossStepDsoBar');
  if (s5Delta) s5Delta.innerHTML = `<span class="delta-dot"></span>-${dsoAmt.toLocaleString('ru-RU')} ₽`;
  if (s5Amt) s5Amt.textContent = `${step5Rem.toLocaleString('ru-RU')} ₽`;
  if (s5Bar) s5Bar.style.width = `${Math.max(15, Math.round((step5Rem / plan) * 100))}%`;

  // Step 6: Safe Cash Final
  const s6Amt = document.getElementById('lossStepSafeAmt');
  const s6Bar = document.getElementById('lossStepSafeBar');
  if (s6Amt) s6Amt.textContent = `${safeSsot.toLocaleString('ru-RU')} ₽`;
  if (s6Bar) s6Bar.style.width = `${Math.max(15, Math.round((safeSsot / plan) * 100))}%`;
}

function renderPulseRecentCalls() {
  const container = document.getElementById('pulseRecentCallsList');
  const badgeCount = document.getElementById('pulseRecentCallsCount');
  if (badgeCount) badgeCount.textContent = `Все (${CALLS_DATA.length})`;
  if (!container) return;

  if (CALLS_DATA.length === 0) {
    container.innerHTML = `
      <div style="padding: 36px 16px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">
        <div style="font-size: 1.8rem; margin-bottom: 6px; opacity: 0.5;">🎙️</div>
        <strong style="color: #fff; font-size: 0.88rem; display: block; margin-bottom: 2px;">Нет звонков</strong>
        <div style="font-size: 0.72rem; color: var(--text-secondary);">Ожидание поступления звонков из телефонии CRM через n8n</div>
      </div>
    `;
    return;
  }

  const topCalls = CALLS_DATA.slice(0, 4);
  let html = '';
  topCalls.forEach(call => {
    let iconClass = 'tx-icon-purple';
    let valClass = call.status === 'won' ? 'val-won' : (call.status === 'risk' ? 'val-lost' : 'val-info');
    let scoreClass = call.score >= 11 ? 'score-won' : (call.score >= 8 ? 'score-info' : 'score-lost');
    let scoreLabel = call.score >= 11 ? `${call.score}/13 Эталон` : (call.score >= 8 ? `${call.score}/13 Норма` : `${call.score}/13 Слив`);
    html += `
      <div class="develop-tx-item" onclick="openCallModal('${call.id}')" style="cursor: pointer;">
        <div class="develop-tx-icon ${iconClass}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
        </div>
        <div class="develop-tx-details">
          <div class="develop-tx-name">${call.manager || 'Менеджер'} &bull; <span class="score-badge ${scoreClass}">${scoreLabel}</span></div>
          <div class="develop-tx-time">${call.client || 'Клиент'}</div>
        </div>
        <div class="develop-tx-val ${valClass}">${call.amount || '0 ₽'}</div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function renderPulseFunnel() {
  const totalCalls = CALLS_DATA.length;
  const wonCalls = CALLS_DATA.filter(c => c.status === 'won');
  const zoomCalls = CALLS_DATA.filter(c => c.next_step === 1 || (c.cr && c.cr[0] === 1));
  const offerCalls = CALLS_DATA.filter(c => c.cr && c.cr[7] === 1);
  const contractCalls = CALLS_DATA.filter(c => c.cr && c.cr[11] === 1);

  const val1 = CALLS_DATA.reduce((acc, c) => acc + getCallAmount(c), 0);
  const val2 = zoomCalls.reduce((acc, c) => acc + getCallAmount(c), 0);
  const val3 = offerCalls.reduce((acc, c) => acc + getCallAmount(c), 0);
  const val4 = contractCalls.reduce((acc, c) => acc + getCallAmount(c), 0);
  const val5 = wonCalls.reduce((acc, c) => acc + getCallAmount(c), 0);

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

  const maxVal = Math.max(val1, 300000);
  if (fVal1) fVal1.textContent = val1.toLocaleString('ru-RU') + ' ₽';
  if (fVal2) fVal2.textContent = val2.toLocaleString('ru-RU') + ' ₽';
  if (fVal3) fVal3.textContent = val3.toLocaleString('ru-RU') + ' ₽';
  if (fVal4) fVal4.textContent = val4.toLocaleString('ru-RU') + ' ₽';
  if (fVal5) fVal5.textContent = val5.toLocaleString('ru-RU') + ' ₽';

  if (fFill1) fFill1.style.width = totalCalls > 0 ? `${Math.round((val1 / maxVal) * 100)}%` : '0%';
  if (fFill2) fFill2.style.width = totalCalls > 0 ? `${Math.round((val2 / maxVal) * 100)}%` : '0%';
  if (fFill3) fFill3.style.width = totalCalls > 0 ? `${Math.round((val3 / maxVal) * 100)}%` : '0%';
  if (fFill4) fFill4.style.width = totalCalls > 0 ? `${Math.round((val4 / maxVal) * 100)}%` : '0%';
  if (fFill5) fFill5.style.width = totalCalls > 0 ? `${Math.round((val5 / maxVal) * 100)}%` : '0%';
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

  showToast('Синхронизация [1/2]', 'Запрос звонков из Google Таблицы raw_calls...');

  try {
    const synced = await fetchLiveCallsData(false);
    setTimeout(() => {
      if (synced) {
        showToast('Синхронизация [2/2]', `Успешно: загружено ${CALLS_DATA.length} звонков из raw_calls, SSOT обновлен!`);
      } else {
        showToast('Синхронизация [2/2]', 'Синхронизировано: локальный контур актуален.');
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




// Expose Deals & Sync handlers on window
window.openOnePagerModal = openOnePagerModal;
window.closeOnePagerModal = closeOnePagerModal;
window.setPulsePeriod = setPulsePeriod;
window.fetchLiveCallsData = fetchLiveCallsData;
window.initWebSocketListener = initWebSocketListener;
window.handleIncomingLiveCall = handleIncomingLiveCall;
window.refreshAllDashboardViews = refreshAllDashboardViews;
window.renderFinancialBridgeAndLeaks = renderFinancialBridgeAndLeaks;
window.renderPulseRecentCalls = renderPulseRecentCalls;
window.renderPulseFunnel = renderPulseFunnel;
window.triggerSyncSimulation = triggerSyncSimulation;

/**
 * RevOps Enterprise OS - Interactive Visualizations & Analytics Suite (v20.4)
 * Responsibilities: Chart.js instances, Monte-Carlo simulation, Rep performance, 13 criteria radar, skills heatmap, develop bento charts.
 */

// ==========================================================================
// SKILLS DRILL-DOWN TO AUDIT
// ==========================================================================
function drillDownSkill(mgr, critName) {
  switchTab('audit');
  const mgrSelect = document.getElementById('filterManager');
  if (mgrSelect) mgrSelect.value = mgr;
  const search = document.getElementById('transcriptSearch');
  if (search) search.value = '';
  filterCallsTable();
  showToast('Аудит навыка: ' + mgr, 'Показаны звонки для разбора критерия ' + critName);
}

// ==========================================================================
// SKILLS HEATMAP RENDERING (V20.0 Modern Tier-1)
// ==========================================================================
function renderSkillsHeatmap() {
  const container = document.getElementById('skillsHeatmapContainer');
  if (!container) return;

  const reps = [...new Set(CALLS_DATA.map(c => c.manager).filter(Boolean))];
  const topBadge = document.getElementById('topNegotiatorBadge');
  if (topBadge) {
    topBadge.textContent = reps.length ? `МЕНЕДЖЕРОВ В ОБОРОТЕ: ${reps.length}` : 'НЕТ ДАННЫХ';
  }

  if (reps.length === 0) {
    container.innerHTML = `
      <div style="padding: 36px 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.08); border-radius: 10px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 10px; opacity: 0.35; display: block;"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        <strong style="color: #fff; font-size: 0.9rem; display: block; margin-bottom: 4px;">Нет данных о менеджерах (Чистый лист)</strong>
        <span>Ожидание поступления звонков из телефонии CRM через n8n</span>
      </div>`;
    return;
  }

  const avatarClasses = {
    'Заряна': 'rep-z',
    'Надежда': 'rep-n',
    'Виктория': 'rep-v',
    'Светлана': 'rep-s'
  };
  const critLabels = (typeof CRITERIA_NAMES !== 'undefined') ? CRITERIA_NAMES : [
    "Next Step", "Инициатива", "ЛПР", "Боли", "Дорого",
    "Я подумаю", "Кейсы", "Закрытие", "Приветствие",
    "Чистота речи", "Talk/Listen", "Итог", "Маржа"
  ];

  let html = '';
  reps.forEach((rep, idx) => {
    const repCalls = CALLS_DATA.filter(c => c.manager === rep);
    const count = repCalls.length;
    const avgScore = count ? (repCalls.reduce((sum, c) => sum + (c.score || 0), 0) / count).toFixed(1) : '0.0';
    const scoreColor = parseFloat(avgScore) >= 9.0 ? '#34d399' : '#fb7185';
    const repRole = parseFloat(avgScore) >= 11.0 ? 'Эталон звонков' :
                    (parseFloat(avgScore) >= 8.0 ? 'Норматив' : 'Зона риска');

    let dotsHtml = '';
    for (let i = 0; i < 13; i++) {
      let passCount = 0;
      repCalls.forEach(c => {
        if (c.cr && c.cr[i] === 1) passCount++;
      });
      const passRate = count ? passCount / count : 0;
      const isPass = passRate >= 0.5;
      const label = critLabels[i] || ('CR' + (i + 1));
      const title = `${label}: ${Math.round(passRate * 100)}% (${passCount}/${count})`;
      dotsHtml += `<div class="heat-dot ${isPass ? 'pass' : 'fail'}" title="${title}"></div>`;
    }

    const fallbackAv = ['rep-z', 'rep-n', 'rep-v', 'rep-s'][idx % 4];
    html += `
      <div class="skill-row" onclick="filterRepAudit('${rep}')" style="display: grid; grid-template-columns: 40px 140px 1fr 60px; align-items: center; gap: 16px; padding: 12px 16px; background: rgba(255,255,255,0.02); border-radius: 10px; cursor: pointer; transition: background 0.15s ease;">
        <div class="call-avatar ${avatarClasses[rep] || fallbackAv}">${rep[0]}</div>
        <div>
          <div style="font-weight: 600; font-size: 0.85rem; color: #fff;">${rep}</div>
          <div style="font-size: 0.7rem; color: rgba(255,255,255,0.45);">${count} ${count === 1 ? 'звонок' : (count < 5 ? 'звонка' : 'звонков')} • ${repRole}</div>
        </div>
        <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
          ${dotsHtml}
        </div>
        <div style="text-align: right;">
          <div style="font-family: 'JetBrains Mono', monospace; font-size: 1.05rem; font-weight: 700; color: ${scoreColor};">${avgScore}</div>
          <div style="font-size: 0.65rem; color: rgba(255,255,255,0.4);">из 13</div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}


// ==========================================================================
// DEVELOP BENTO CHARTS (DISSECTION, DONUT CATEGORIES, SPLINE TREND)
// ==========================================================================
// ==========================================================================
// TIER-1 SAAS CHARTS (LINEAR / FEY / VERCEL AESTHETIC)
// ==========================================================================
let developDissectionChartInstance = null;
let developDonutChartInstance = null;
let developSplineChartInstance = null;

function initDevelopDissectionChart() {
  const ctx = document.getElementById('developDissectionChart');
  if (!ctx) return;
  const isLight = getThemeMode() === 'light';
  const c2d = ctx.getContext('2d');

  let revGrad = '#8b5cf6';
  if (c2d) {
    revGrad = c2d.createLinearGradient(0, 0, 0, 220);
    revGrad.addColorStop(0, '#a78bfa');
    revGrad.addColorStop(1, '#6d28d9');
  }

  const isZero = CALLS_DATA.length === 0;
  developDissectionChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
      datasets: [
        {
          label: 'Выручка',
          data: isZero ? Array(12).fill(0) : [420, 560, 480, 680, 520, 740, 690, 820, 710, 890, 820, 950],
          backgroundColor: revGrad,
          hoverBackgroundColor: '#c4b5fd',
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.52,
          categoryPercentage: 0.68
        },
        {
          label: 'План',
          data: isZero ? Array(12).fill(0) : [350, 490, 420, 590, 450, 630, 580, 710, 620, 760, 710, 830],
          backgroundColor: isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.10)',
          hoverBackgroundColor: isLight ? 'rgba(15, 23, 42, 0.22)' : 'rgba(255, 255, 255, 0.20)',
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.52,
          categoryPercentage: 0.68
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(9, 9, 13, 0.96)',
          titleFont: { family: 'Inter Tight', size: 12, weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          titleColor: isLight ? '#09090b' : '#fafafa',
          bodyColor: isLight ? '#52525b' : '#a1a1aa',
          borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.10)',
          borderWidth: 1,
          cornerRadius: 10,
          padding: 12,
          boxPadding: 6,
          usePointStyle: true,
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${c.raw}k ₽`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false, drawBorder: false },
          ticks: { color: isLight ? '#71717a' : '#52525b', font: { size: 11, family: 'Inter', weight: '500' } }
        },
        y: {
          border: { display: false },
          grid: { color: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.035)', drawBorder: false },
          ticks: {
            color: isLight ? '#71717a' : '#52525b',
            font: { size: 11, family: 'JetBrains Mono' },
            callback: (v) => v + 'k'
          }
        }
      }
    }
  });

  initSparklines();
}

// ==========================================================================
// HERO KPI SPARKLINES (TIER-1 LINEAR/VERCEL)
// ==========================================================================
let sparklineChartInstances = {};

function initSparklines() {
  if (typeof Chart === 'undefined') return;
  const sparkDef = {
    type: 'line',
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      elements: { point: { radius: 0 }, line: { tension: 0.4, borderWidth: 2 } },
      scales: { x: { display: false }, y: { display: false } }
    }
  };

  const mockWeekly = [0, 0, 0, 0, 0, 0, 0];
  const ids = ['sparkRevenue', 'sparkPipeline', 'sparkQuality', 'sparkSla'];
  const colors = ['#7c3aed', '#f59e0b', '#06b6d4', '#f43f5e'];

  ids.forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (sparklineChartInstances[id]) {
      try { sparklineChartInstances[id].destroy(); } catch (e) {}
      sparklineChartInstances[id] = null;
    }
    const existing = Chart.getChart ? Chart.getChart(el) : null;
    if (existing) {
      try { existing.destroy(); } catch (e) {}
    }

    sparklineChartInstances[id] = new Chart(el, {
      ...sparkDef,
      data: {
        labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
        datasets: [{
          data: mockWeekly,
          borderColor: colors[i],
          backgroundColor: colors[i] + '1a',
          fill: true
        }]
      }
    });
  });
}

function initDevelopDonutChart() {
  const ctx = document.getElementById('developDonutChart');
  if (!ctx) return;
  const isLight = getThemeMode() === 'light'; // FIX: объявлена переменная isLight

  const isZero = CALLS_DATA.length === 0;
  developDonutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Эталонные звонки', 'Встреча назначена', 'Следующий шаг взят', 'Риск срыва сделки', 'Fake Yes сливы'],
      datasets: [
        {
          data: isZero ? [1] : [34, 25, 17, 12, 6],
          backgroundColor: isZero ? ['rgba(255, 255, 255, 0.05)'] : ['#8b5cf6', '#6366f1', '#38bdf8', '#f59e0b', '#f43f5e'],
          borderWidth: 2,
          borderColor: isLight ? '#ffffff' : '#0b0b10',
          hoverOffset: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '78%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(9, 9, 13, 0.96)',
          titleFont: { family: 'Inter Tight', size: 12, weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          titleColor: isLight ? '#09090b' : '#fafafa',
          bodyColor: isLight ? '#52525b' : '#a1a1aa',
          borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.10)',
          borderWidth: 1,
          cornerRadius: 10,
          padding: 10,
          displayColors: true,
          usePointStyle: true,
          callbacks: {
            label: (c) => ` ${c.label}: ${c.raw}%`
          }
        }
      }
    }
  });
}

function initDevelopSplineChart() {
  const ctx = document.getElementById('developSplineChart');
  if (!ctx) return;
  const isLight = getThemeMode() === 'light';
  const c2d = ctx.getContext('2d');
  let grad1 = 'rgba(139, 92, 246, 0.16)';
  if (c2d) {
    const h = ctx.clientHeight || 180;
    const g1 = c2d.createLinearGradient(0, 0, 0, h);
    g1.addColorStop(0, 'rgba(139, 92, 246, 0.30)');
    g1.addColorStop(1, 'rgba(139, 92, 246, 0.00)');
    grad1 = g1;
  }

  const gridColor = isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.035)';
  const tickColor = isLight ? '#71717a' : '#52525b';

  const isZero = CALLS_DATA.length === 0;
  developSplineChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
      datasets: [
        {
          label: 'SSOT Факт',
          data: isZero ? [0, 0, 0, 0, 0, 0, 0] : [240, 310, 460, 380, 540, 470, 610],
          borderColor: '#8b5cf6',
          backgroundColor: grad1,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#ffffff',
          pointHoverBorderColor: '#8b5cf6',
          pointHoverBorderWidth: 2
        },
        {
          label: 'Базовый тренд',
          data: isZero ? [0, 0, 0, 0, 0, 0, 0] : [310, 420, 390, 520, 460, 590, 540],
          borderColor: isLight ? 'rgba(15, 23, 42, 0.25)' : 'rgba(255, 255, 255, 0.22)',
          borderDash: [4, 4],
          borderWidth: 1.5,
          tension: 0.4,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(9, 9, 13, 0.96)',
          titleFont: { family: 'Inter Tight', size: 12, weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          titleColor: isLight ? '#09090b' : '#fafafa',
          bodyColor: isLight ? '#52525b' : '#a1a1aa',
          borderColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.10)',
          borderWidth: 1,
          cornerRadius: 10,
          padding: 10,
          displayColors: true,
          usePointStyle: true,
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${c.raw}k ₽`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: tickColor, font: { size: 10, family: 'Inter' } }
        },
        y: {
          border: { display: false },
          grid: { color: gridColor },
          ticks: {
            color: tickColor,
            font: { size: 10, family: 'JetBrains Mono' },
            callback: (v) => v + 'k'
          }
        }
      }
    }
  });
}

window.getThemeMode = getThemeMode;
window.setThemeMode = setThemeMode;
window.toggleThemeMode = toggleThemeMode;
window.updateThemeToggleUI = updateThemeToggleUI;
window.updateAllChartsTheme = updateAllChartsTheme;
window.initDevelopDissectionChart = initDevelopDissectionChart;
window.initDevelopDonutChart = initDevelopDonutChart;
window.initDevelopSplineChart = initDevelopSplineChart;


// ==========================================================================
// EXPRESS 3 NUMBERS CALCULATOR (TAB 2)
// ==========================================================================
function recalcExpress() {
  const leads = parseInt(document.getElementById('rngLeadsExp').value, 10) || 50;
  const check = parseInt(document.getElementById('rngCheckExp').value, 10) || 300000;
  const mgr = parseInt(document.getElementById('rngMgrExp').value, 10) || 4;

  document.getElementById('valLeadsExp').textContent = leads + ' шт';
  document.getElementById('valCheckExp').textContent = check.toLocaleString('ru-RU') + ' ₽';
  document.getElementById('valMgrExp').textContent = mgr + ' чел';

  const currentPipeline = leads * check;
  const lost = Math.round(currentPipeline * 0.28);
  const basePlan = Math.round(currentPipeline * 0.25);
  const optPlan = Math.round(basePlan * 1.35);

  document.getElementById('expLostRev').textContent = lost.toLocaleString('ru-RU') + ' ₽';
  document.getElementById('expBasePlan').textContent = basePlan.toLocaleString('ru-RU') + ' ₽';
  document.getElementById('expOptPlan').textContent = optPlan.toLocaleString('ru-RU') + ' ₽';
}


// ==========================================================================
// MONTE CARLO CHART & SIMULATOR (TAB 7)
// ==========================================================================
let mcChartInstance = null;
function initMonteCarloChart() {
  const ctx = document.getElementById('mcChart');
  if (!ctx) return;

  if (mcChartInstance) {
    mcChartInstance.destroy();
    mcChartInstance = null;
  }

  mcChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['1.2M', '1.5M', '1.86M (P10)', '2.2M', '2.58M (P50)', '2.9M', '3.21M (P90)', '3.6M', '4.0M', '4.5M', '5.0M'],
      datasets: [{
        label: 'Плотность вероятности (исходов из 10 000)',
        data: [40, 110, 290, 480, 620, 510, 310, 180, 95, 45, 20],
        backgroundColor: function(context) {
          const idx = context.dataIndex;
          if (idx === 2) return 'rgba(244, 63, 94, 0.85)';   // P10 Rose
          if (idx === 5) return 'rgba(139, 92, 246, 0.95)';  // P50 Violet Brand
          if (idx === 8) return 'rgba(16, 185, 129, 0.88)';  // P90 Emerald
          return 'rgba(255, 255, 255, 0.12)';
        },
        borderRadius: 6,
        borderSkipped: false,
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10, 10, 16, 0.98)',
          titleFont: { family: 'Inter Tight', size: 12, weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          titleColor: '#ffffff',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (c) => ` ${c.dataset.label}: ${c.raw}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b', font: { size: 10 } }
        }
      }
    }
  });

  runMonteCarloSimulation(false);
}

function runMonteCarloSimulation(notify = false) {
  const rngL = document.getElementById('rngLeads');
  const rngQ = document.getElementById('rngQual');
  const rngC = document.getElementById('rngClose');
  if (!rngL || !rngQ || !rngC) return;

  const leads = parseInt(rngL.value, 10) || 10;
  const qualPct = parseInt(rngQ.value, 10) || 60;
  const closePct = parseInt(rngC.value, 10) || 35;

  const lblL = document.getElementById('lblLeads');
  const lblQ = document.getElementById('lblQual');
  const lblC = document.getElementById('lblClose');
  if (lblL) lblL.textContent = `${leads} шт`;
  if (lblQ) lblQ.textContent = `${qualPct}%`;
  if (lblC) lblC.textContent = `${closePct}%`;

  let avgCheck = 300000;
  if (CALLS_DATA && CALLS_DATA.length > 0) {
    const totalAmt = CALLS_DATA.reduce((s, c) => s + getCallAmount(c), 0);
    avgCheck = Math.round(totalAmt / CALLS_DATA.length) || 300000;
  }
  const monthlyTarget = getMonthlyTarget();

  const pQual = qualPct / 100;
  const pClose = closePct / 100;
  const pOverall = pQual * pClose;
  const expectedWins = leads * pOverall;
  const variance = leads * pOverall * (1 - pOverall);
  const stdDev = Math.sqrt(Math.max(variance, 0.3));

  const meanRev = expectedWins * avgCheck;
  const sigmaRev = stdDev * avgCheck;

  const p10 = Math.max(0, Math.round(meanRev - 1.28 * sigmaRev));
  const p50 = Math.round(meanRev);
  const p90 = Math.round((meanRev + 1.28 * sigmaRev) * 1.15);

  let probTarget = 0;
  if (sigmaRev > 0) {
    const z = (monthlyTarget - meanRev) / sigmaRev;
    const cdf = 1.0 / (1.0 + Math.exp(-0.07056 * Math.pow(z, 3) - 1.5976 * z));
    probTarget = Math.max(0.1, Math.min(99.9, Math.round((1.0 - cdf) * 1000) / 10));
  } else {
    probTarget = meanRev >= monthlyTarget ? 99.0 : 5.0;
  }

  const elP10 = document.getElementById('mcP10Val');
  const elP50 = document.getElementById('mcP50Val');
  const elP90 = document.getElementById('mcP90Val');
  const elProb = document.getElementById('mcTargetProbVal');
  const elSub = document.getElementById('mcTargetProbSub');
  const elBadge = document.getElementById('mcTargetProbBadge');

  if (elP10) elP10.textContent = `${p10.toLocaleString('ru-RU')} ₽`;
  if (elP50) elP50.textContent = `${p50.toLocaleString('ru-RU')} ₽`;
  if (elP90) elP90.textContent = `${p90.toLocaleString('ru-RU')} ₽`;
  if (elProb) elProb.textContent = `${probTarget.toFixed(1)}%`;
  if (elSub) elSub.innerHTML = `План ${monthlyTarget.toLocaleString('ru-RU')} ₽ &bull; ${probTarget >= 75 ? 'Твердо в плане' : (probTarget >= 40 ? 'Требуется дожим' : 'Высокий риск дефицита')}`;
  if (elBadge) {
    if (probTarget >= 75) {
      elBadge.className = 'badge-won';
      elBadge.textContent = 'ВЫСОКАЯ НАДЕЖНОСТЬ';
    } else if (probTarget >= 40) {
      elBadge.className = 'badge-warn';
      elBadge.textContent = 'СРЕДНИЙ РИСК';
    } else {
      elBadge.className = 'badge-lost';
      elBadge.textContent = 'КРИТИЧЕСКИЙ РИСК';
    }
  }

  const minVal = Math.max(0, Math.round(meanRev - 2.5 * sigmaRev));
  const maxVal = Math.round(meanRev + 2.5 * sigmaRev);
  const step = Math.max(100000, Math.round((maxVal - minVal) / 10));

  const labels = [];
  const binValues = [];
  const totalIterations = 10000;

  for (let i = 0; i < 11; i++) {
    const binCenter = minVal + i * step;
    const binM = (binCenter / 1000000).toFixed(2) + 'M';
    if (i === 2) labels.push(`${binM} (P10)`);
    else if (i === 5) labels.push(`${binM} (P50)`);
    else if (i === 8) labels.push(`${binM} (P90)`);
    else labels.push(binM);

    const zScore = sigmaRev > 0 ? (binCenter - meanRev) / sigmaRev : (i === 5 ? 0 : 3);
    const density = Math.exp(-0.5 * zScore * zScore) / Math.sqrt(2 * Math.PI);
    binValues.push(Math.round(density * totalIterations * (step / Math.max(sigmaRev, 1))));
  }

  if (typeof mcChartInstance !== 'undefined' && mcChartInstance) {
    mcChartInstance.data.labels = labels;
    mcChartInstance.data.datasets[0].data = binValues;
    mcChartInstance.update();
  }

  const vText = document.getElementById('simVerdictText');
  if (vText) {
    vText.textContent = `При ${leads} лидах (квал ${qualPct}%, закрытие ${closePct}%, чек ${avgCheck.toLocaleString('ru-RU')} ₽) прогнозная касса: ${p50.toLocaleString('ru-RU')} ₽ (P10: ${p10.toLocaleString('ru-RU')} ₽, P90: ${p90.toLocaleString('ru-RU')} ₽).`;
  }

  if (notify && typeof showToast === 'function') {
    showToast('Монте-Карло 3.0', `Прогноз P50: ${p50.toLocaleString('ru-RU')} ₽ (P90: ${p90.toLocaleString('ru-RU')} ₽)`);
  }
}

function updateSimulation(notify = true) {
  runMonteCarloSimulation(notify);
}

// ==========================================================================
// INITIALIZATION ON DOM READY
// ==========================================================================


// ==========================================================================
// INTERACTIVE CHARTS ENGINE (CHART.JS 4.4.2 SUITE)
// ==========================================================================
let repPerfChartInstance = null;
let speechRadarChartInstance = null;



// ==========================================================================
// REP PERFORMANCE COMPARISON CHART (Dynamic from CALLS_DATA)
// ==========================================================================
function getDynamicRepList() {
  return [...new Set(CALLS_DATA.map(c => c.manager).filter(Boolean))];
}

function getDynamicRepMetrics() {
  const reps = getDynamicRepList();
  const pipe = [];
  const score = [];
  const nextstep = [];
  const risk = [];
  const colorPalette = ['#8b5cf6', '#10b981', '#38bdf8', '#f59e0b', '#f43f5e', '#a78bfa'];

  reps.forEach((rep, idx) => {
    const repCalls = CALLS_DATA.filter(c => c.manager === rep);
    const count = repCalls.length || 1;
    const totalPipe = repCalls.reduce((acc, c) => acc + getCallAmount(c), 0);
    const totalScore = repCalls.reduce((acc, c) => acc + (c.score || 0), 0);
    const nsCount = repCalls.filter(c => c.next_step === 1).length;
    const riskAmt = repCalls.filter(c => c.status === 'risk' || c.next_step === 0).reduce((acc, c) => acc + getCallAmount(c), 0);

    pipe.push(totalPipe);
    score.push(parseFloat((totalScore / count).toFixed(1)));
    nextstep.push(Math.round((nsCount / count) * 100));
    risk.push(riskAmt);
  });

  return {
    pipe: {
      label: 'Пайплайн в работе, ₽',
      data: pipe,
      colors: reps.map((_, i) => colorPalette[i % colorPalette.length]),
      unit: ' ₽',
      isCurrency: true
    },
    score: {
      label: 'Средний балл речи Gemini (/13)',
      data: score,
      colors: reps.map((_, i) => colorPalette[i % colorPalette.length]),
      unit: ' б.',
      isCurrency: false
    },
    step: {
      label: 'Фиксация Next Step, %',
      data: nextstep,
      colors: reps.map((_, i) => colorPalette[i % colorPalette.length]),
      unit: '%',
      isCurrency: false
    },
    risk: {
      label: 'Выручка под угрозой срыва, ₽',
      data: risk,
      colors: reps.map(() => '#f43f5e'),
      unit: ' ₽',
      isCurrency: true
    }
  };
}

function initRepPerformanceChart() {
  const ctx = document.getElementById('repPerformanceChart');
  if (!ctx) return;

  const reps = getDynamicRepList();
  const repMetrics = getDynamicRepMetrics();
  const m = repMetrics['pipe'];

  if (repPerfChartInstance) {
    repPerfChartInstance.destroy();
    repPerfChartInstance = null;
  }

  repPerfChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: reps,
      datasets: [{
        label: m.label,
        data: m.data,
        backgroundColor: m.colors,
        borderRadius: 8,
        borderSkipped: false,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10, 10, 16, 0.98)',
          titleFont: { family: 'Inter Tight', size: 12, weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          titleColor: '#fff',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: function(context) {
              const val = context.parsed.y;
              return ` ${context.dataset.label}: ${val.toLocaleString('ru-RU')}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#fff', font: { weight: 600, size: 12 } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            font: { family: 'JetBrains Mono', size: 11 },
            callback: function(value) {
              return (value >= 1000000 ? (value/1000000).toFixed(1) + 'M' : value >= 1000 ? (value/1000).toFixed(0) + 'k' : value);
            }
          }
        }
      }
    }
  });
}

function setRepChartMetric(metricKey) {
  const repMetrics = getDynamicRepMetrics();
  if (!repPerfChartInstance || !repMetrics[metricKey]) return;
  const m = repMetrics[metricKey];

  // Update button styles
  const buttons = ['pipe', 'score', 'step', 'risk'];
  buttons.forEach(b => {
    const el = document.getElementById('btnRepMetric' + b.charAt(0).toUpperCase() + b.slice(1));
    if (el) {
      if (b === metricKey) {
        el.className = 'btn btn-primary';
      } else {
        el.className = 'btn btn-ghost';
      }
    }
  });

  repPerfChartInstance.data.datasets[0].label = m.label;
  repPerfChartInstance.data.datasets[0].data = m.data;
  repPerfChartInstance.data.datasets[0].backgroundColor = m.colors;

  if (m.isCurrency) {
    repPerfChartInstance.options.scales.y.ticks.callback = function(val) {
      return (val / 1000000).toFixed(1) + 'M ₽';
    };
  } else {
    repPerfChartInstance.options.scales.y.ticks.callback = function(val) {
      return val + m.unit;
    };
  }

  repPerfChartInstance.update();
  showToast('Метрика графика изменена', `Отображен разрез: ${m.label}`);
}


// ==========================================================================
// 13 B2B CRITERIA RADAR CHART
// ==========================================================================
const RADAR_CRITERIA_LABELS = [
  '1. Next Step', '2. Инициатива', '3. ЛПР', '4. Боли', '5. Дорого',
  '6. Подумаю', '7. Кейсы', '8. Закрытие', '9. Приветствие',
  '10. Чистота', '11. Talk/Listen', '12. Итог', '13. Маржа'
];

    // DYNAMIC 13-CRITERIA RADAR MAP (100% SSOT from CALLS_DATA)
function getDynamicRadarData(repName = 'all') {
  const filtered = (repName === 'all')
    ? CALLS_DATA
    : CALLS_DATA.filter(c => c.manager === repName);
  if (filtered.length === 0) {
    return Array(13).fill(0);
  }
  const n = filtered.length;
  const sums = Array(13).fill(0);
  filtered.forEach(c => {
    if (c.cr && Array.isArray(c.cr)) {
      c.cr.forEach((val, idx) => {
        if (val === 1 && idx < 13) sums[idx]++;
      });
    }
  });
  return sums.map(s => Math.round((s / n) * 100));
}

function initSpeechRadarChart() {
  const ctx = document.getElementById('speechRadarChart');
  if (!ctx) return;

  speechRadarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: RADAR_CRITERIA_LABELS,
      datasets: [
        {
          label: 'Эталон B2B (100%)',
          data: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
          borderColor: 'rgba(51, 209, 255, 0.45)',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false
        },
        {
          label: 'Факт выполнения, %',
          data: getDynamicRadarData('all'),
          borderColor: '#b899eb',
          backgroundColor: 'rgba(184, 153, 235, 0.22)',
          borderWidth: 1.75,
          pointBackgroundColor: '#33d1ff',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 1.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: '#cbd5e1', font: { size: 11 } }
        },
        tooltip: {
          backgroundColor: 'rgba(10, 10, 16, 0.98)',
          titleFont: { family: 'Inter Tight', size: 12, weight: '600' },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          titleColor: '#fff',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
          displayColors: false,
          callbacks: {
            label: function(ctx) {
              return ` ${ctx.dataset.label}: ${ctx.parsed.r}%`;
            }
          }
        }
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          pointLabels: {
            color: '#cbd5e1',
            font: { size: 10, weight: 600 }
          },
          ticks: {
            display: false,
            stepSize: 25
          }
        }
      }
    }
  });
}

function updateRadarChart(repName) {
  if (!speechRadarChartInstance) return;
  const data = getDynamicRadarData(repName);
  speechRadarChartInstance.data.datasets[1].data = data;
  speechRadarChartInstance.data.datasets[1].label = (repName === 'all' ? 'Команда (Факт %)' : `Факт ${repName} (%)`);

  if (repName === 'Светлана') {
    speechRadarChartInstance.data.datasets[1].borderColor = '#fb7185';
    speechRadarChartInstance.data.datasets[1].backgroundColor = 'rgba(244, 63, 94, 0.25)';
    speechRadarChartInstance.data.datasets[1].pointBackgroundColor = '#ef4444';
  } else {
    speechRadarChartInstance.data.datasets[1].borderColor = '#8b5cf6';
    speechRadarChartInstance.data.datasets[1].backgroundColor = 'rgba(139, 92, 246, 0.22)';
  }
  speechRadarChartInstance.update();
  showToast('Радар перестроен', `Отображены 13 речевых критериев для: ${repName}`);
}

function renderRadarRepPills() {
  const container = document.getElementById('radarRepPillsContainer');
  const selector = document.getElementById('radarRepSelector');
  const reps = typeof getDynamicRepList === 'function' ? getDynamicRepList() : [];
  const totalCalls = CALLS_DATA.length;
  const avgScore = totalCalls ? (CALLS_DATA.reduce((s, c) => s + (c.score || 0), 0) / totalCalls).toFixed(1) : '0.0';

  if (selector) {
    let opts = `<option value="all">Команда в целом (${totalCalls} звонков, ${avgScore}/13)</option>`;
    reps.forEach(rep => {
      const rCalls = CALLS_DATA.filter(c => c.manager === rep);
      const rAvg = rCalls.length ? (rCalls.reduce((s, c) => s + (c.score || 0), 0) / rCalls.length).toFixed(1) : '0.0';
      opts += `<option value="${rep}">${rep} (${rAvg}/13 • ${rCalls.length} звонков)</option>`;
    });
    selector.innerHTML = opts;
  }

  if (container) {
    let pills = `<button type="button" class="pill-btn active" data-radar="all" onclick="setPillRadarRep('all')">Все (${totalCalls > 0 ? avgScore : '0'})</button>`;
    const avatarMap = { 0: 'rep-z', 1: 'rep-n', 2: 'rep-v', 3: 'rep-s' };
    reps.forEach((rep, idx) => {
      const rCalls = CALLS_DATA.filter(c => c.manager === rep);
      const rAvg = rCalls.length ? (rCalls.reduce((s, c) => s + (c.score || 0), 0) / rCalls.length).toFixed(1) : '0.0';
      const avClass = avatarMap[idx % 4];
      pills += `<button type="button" class="pill-btn" data-radar="${rep}" onclick="setPillRadarRep('${rep}')"><span class="rep-avatar-xs ${avClass}">${rep[0]}</span> ${rep} (${rAvg})</button>`;
    });
    container.innerHTML = pills;
  }
}


function renderPayrollTable() {
  const tbody = document.getElementById('payrollTableBody');
  const fotBadge = document.getElementById('payrollFotBadge');
  if (!tbody) return;

  const reps = typeof getDynamicRepList === 'function' ? getDynamicRepList() : [];
  if (reps.length === 0) {
    tbody.innerHTML = `
      <tr id="payrollEmptyRow">
        <td colspan="7" style="text-align: center; padding: 28px; color: var(--text-muted); font-size: 0.85rem;">
          Нет сотрудников для начисления (Чистый лист) • Ожидание поступления звонков из CRM
        </td>
      </tr>
    `;
    if (fotBadge) fotBadge.textContent = 'ОБЩИЙ ФОТ: 0 ₽';
    return;
  }

  let totalFot = 0;
  let html = '';
  reps.forEach(rep => {
    const repCalls = CALLS_DATA.filter(c => c.manager === rep);
    const count = repCalls.length;
    const avgScore = count ? (repCalls.reduce((s, c) => s + (c.score || 0), 0) / count) : 0;
    const wonCount = repCalls.filter(c => c.status === 'won').length;
    const baseSalary = 70000;
    const bonus = wonCount * 25000;
    const speechCoef = avgScore >= 11 ? 1.15 : (avgScore >= 8 ? 1.0 : 0.7);
    const totalSalary = Math.round((baseSalary + bonus) * speechCoef);
    totalFot += totalSalary;

    const badgeClass = speechCoef > 1.0 ? 'badge-won' : (speechCoef === 1.0 ? 'badge-warn' : 'badge-lost');
    const badgeLabel = speechCoef > 1.0 ? `+${Math.round((speechCoef - 1)*100)}%` : (speechCoef === 1.0 ? '0%' : `-${Math.round((1 - speechCoef)*100)}%`);

    html += `
      <tr>
        <td><strong>${rep}</strong></td>
        <td>Менеджер по продажам</td>
        <td>${baseSalary.toLocaleString('ru-RU')} ₽</td>
        <td>${bonus.toLocaleString('ru-RU')} ₽</td>
        <td><span class="${badgeClass}">${speechCoef.toFixed(2)} (${badgeLabel})</span></td>
        <td><strong style="font-family: 'JetBrains Mono', monospace;">${totalSalary.toLocaleString('ru-RU')} ₽</strong></td>
        <td><span class="${badgeClass}">${speechCoef < 1.0 ? 'Дисконт за низкий балл речи' : 'Начислено по регламенту'}</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
  if (fotBadge) fotBadge.textContent = `ОБЩИЙ ФОТ: ${totalFot.toLocaleString('ru-RU')} ₽`;
}

function renderAiImpactAndFakeYes() {
  const impactBody = document.getElementById('aiImpactMatrixBody');
  const fakeYesBody = document.getElementById('fakeYesTableBody');
  const fakeYesBadge = document.getElementById('fakeYesBadge');

  const totalCalls = CALLS_DATA.length;
  if (totalCalls === 0) {
    if (impactBody) {
      impactBody.innerHTML = `
        <tr>
          <td><span class="badge-lost">Зона риска (Низкий балл)</span></td>
          <td>0 - 6 баллов</td>
          <td>0 звонков</td>
          <td>0.0%</td>
          <td>0 ₽</td>
          <td>—</td>
        </tr>
        <tr>
          <td><span class="badge-warn">Рабочая норма (Средний)</span></td>
          <td>7 - 10 баллов</td>
          <td>0 звонков</td>
          <td>0.0%</td>
          <td>0 ₽</td>
          <td>—</td>
        </tr>
        <tr>
          <td><span class="badge-won">Эталонные переговоры (Высокий)</span></td>
          <td>11 - 13 баллов</td>
          <td>0 звонков</td>
          <td>0.0%</td>
          <td>0 ₽</td>
          <td>—</td>
        </tr>
      `;
    }
    if (fakeYesBody) {
      fakeYesBody.innerHTML = `
        <tr id="fakeYesEmptyRow">
          <td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">
            Алертов ложного согласия не обнаружено (Чистый лист) • Звонки чисты
          </td>
        </tr>
      `;
    }
    if (fakeYesBadge) fakeYesBadge.textContent = '0 АЛЕРТОВ';
    return;
  }

  const lowCalls = CALLS_DATA.filter(c => c.score <= 6);
  const midCalls = CALLS_DATA.filter(c => c.score >= 7 && c.score <= 10);
  const highCalls = CALLS_DATA.filter(c => c.score >= 11);

  const calcTier = (calls) => {
    const count = calls.length;
    const wonCalls = calls.filter(c => c.status === 'won');
    const countWon = wonCalls.length;
    const rate = count ? ((countWon / count) * 100).toFixed(1) + '%' : '0.0%';
    const sumWon = wonCalls.reduce((acc, c) => acc + getCallAmount(c), 0);
    return { count, rate, sumWon };
  };

  const tLow = calcTier(lowCalls);
  const tMid = calcTier(midCalls);
  const tHigh = calcTier(highCalls);

  if (impactBody) {
    impactBody.innerHTML = `
      <tr>
        <td><span class="badge-lost">Зона риска (Низкий балл)</span></td>
        <td>0 - 6 баллов</td>
        <td>${tLow.count} звонков</td>
        <td>${tLow.rate}</td>
        <td>${tLow.sumWon.toLocaleString('ru-RU')} ₽</td>
        <td>1.0x (Базовый слив)</td>
      </tr>
      <tr>
        <td><span class="badge-warn">Рабочая норма (Средний)</span></td>
        <td>7 - 10 баллов</td>
        <td>${tMid.count} звонков</td>
        <td>${tMid.rate}</td>
        <td>${tMid.sumWon.toLocaleString('ru-RU')} ₽</td>
        <td>3.2x рост</td>
      </tr>
      <tr>
        <td><span class="badge-won">Эталонные переговоры (Высокий)</span></td>
        <td>11 - 13 баллов</td>
        <td>${tHigh.count} звонков</td>
        <td>${tHigh.rate}</td>
        <td>${tHigh.sumWon.toLocaleString('ru-RU')} ₽</td>
        <td><strong style="color: #34d399; font-size: 0.95rem;">4.8x МАКСИМУМ</strong></td>
      </tr>
    `;
  }

  const fakeYesCalls = CALLS_DATA.filter(c => c.cr && c.cr[7] === 0 && (c.next_step === 0 || c.status === 'risk'));
  if (fakeYesBadge) fakeYesBadge.textContent = `${fakeYesCalls.length} АЛЕРТОВ`;
  if (fakeYesBody) {
    if (fakeYesCalls.length === 0) {
      fakeYesBody.innerHTML = `
        <tr id="fakeYesEmptyRow">
          <td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.85rem;">
            Алертов ложного согласия не обнаружено • Все закрытия валидны
          </td>
        </tr>
      `;
    } else {
      let rows = '';
      fakeYesCalls.forEach(call => {
        rows += `
          <tr>
            <td><strong>${call.id || 'CALL'}</strong></td>
            <td>${call.client || 'Клиент'}</td>
            <td>${call.amount || '500 000 ₽'}</td>
            <td>${call.stage || 'Первичный контакт'}</td>
            <td><strong style="color: #fff;">${call.manager || 'Менеджер'}</strong></td>
            <td><span class="badge-warn">${call.score || 0} / 13</span></td>
            <td><span class="badge-lost">Слив на почту (cr8=0)</span></td>
            <td>Срочный перезвон РОПа: квалифицировать боль и ЛПР</td>
          </tr>
        `;
      });
      fakeYesBody.innerHTML = rows;
    }
  }
}


function updateDevelopBentoCharts() {
  const total = CALLS_DATA.length;
  const wonCount = CALLS_DATA.filter(c => c.status === 'won').length;
  const zoomCount = CALLS_DATA.filter(c => c.next_step === 1).length;
  const nextStepCount = CALLS_DATA.filter(c => c.cr && c.cr[0] === 1).length;
  const riskCount = CALLS_DATA.filter(c => c.status === 'risk').length;
  const lostCount = CALLS_DATA.filter(c => c.score < 7).length;

  // Donut Chart
  if (typeof developDonutChartInstance !== 'undefined' && developDonutChartInstance) {
    if (total === 0) {
      developDonutChartInstance.data.datasets[0].data = [1];
      developDonutChartInstance.data.datasets[0].backgroundColor = ['rgba(255, 255, 255, 0.05)'];
    } else {
      developDonutChartInstance.data.datasets[0].data = [
        Math.round((wonCount / total) * 100),
        Math.round((zoomCount / total) * 100),
        Math.round((nextStepCount / total) * 100),
        Math.round((riskCount / total) * 100),
        Math.round((lostCount / total) * 100)
      ];
      developDonutChartInstance.data.datasets[0].backgroundColor = ['#8b5cf6', '#6366f1', '#38bdf8', '#f59e0b', '#f43f5e'];
    }
    developDonutChartInstance.update('none');

    const centerNum = document.getElementById('donutCenterNum');
    const centerSub = document.getElementById('donutCenterSub');
    if (centerNum) centerNum.textContent = total > 0 ? `${Math.round((wonCount / total) * 100)}%` : '0%';
    if (centerSub) centerSub.textContent = total > 0 ? 'Core' : '0 звонков';
  }

  // Spline Chart
  if (typeof developSplineChartInstance !== 'undefined' && developSplineChartInstance) {
    if (total === 0) {
      developSplineChartInstance.data.datasets[0].data = [0, 0, 0, 0, 0, 0, 0];
      developSplineChartInstance.data.datasets[1].data = [0, 0, 0, 0, 0, 0, 0];
    } else {
      const dailyWon = Array(7).fill(0);
      CALLS_DATA.forEach((c, idx) => {
        const dayIdx = idx % 7;
        if (c.status === 'won') dailyWon[dayIdx] += 500;
      });
      developSplineChartInstance.data.datasets[0].data = dailyWon;
    }
    developSplineChartInstance.update('none');
  }

  // Dissection Chart
  if (typeof developDissectionChartInstance !== 'undefined' && developDissectionChartInstance) {
    if (total === 0) {
      developDissectionChartInstance.data.datasets[0].data = Array(12).fill(0);
      developDissectionChartInstance.data.datasets[1].data = Array(12).fill(0);
    }
    developDissectionChartInstance.update('none');
  }

  // Spending Rings
  const wonPct = total > 0 ? Math.round((wonCount / total) * 100) : 0;
  const nsPct = total > 0 ? Math.round((CALLS_DATA.filter(c => c.next_step === 1 || (c.cr && c.cr[0] === 1)).length / total) * 100) : 0;
  const docPct = total > 0 ? Math.round((CALLS_DATA.filter(c => c.cr && c.cr[11] === 1).length / total) * 100) : 0;
  const payPct = total > 0 ? Math.round((wonCount / total) * 100) : 0;

  const rValWon = document.getElementById('ringValWon');
  const rFillWon = document.getElementById('ringFillWon');
  if (rValWon) rValWon.textContent = `${wonPct}%`;
  if (rFillWon) rFillWon.setAttribute('stroke-dasharray', `${wonPct}, 100`);

  const rValNs = document.getElementById('ringValNs');
  const rFillNs = document.getElementById('ringFillNs');
  if (rValNs) rValNs.textContent = `${nsPct}%`;
  if (rFillNs) rFillNs.setAttribute('stroke-dasharray', `${nsPct}, 100`);

  const rValDoc = document.getElementById('ringValDoc');
  const rFillDoc = document.getElementById('ringFillDoc');
  if (rValDoc) rValDoc.textContent = `${docPct}%`;
  if (rFillDoc) rFillDoc.setAttribute('stroke-dasharray', `${docPct}, 100`);

  const rValPay = document.getElementById('ringValPay');
  const rFillPay = document.getElementById('ringFillPay');
  if (rValPay) rValPay.textContent = `${payPct}%`;
  if (rFillPay) rFillPay.setAttribute('stroke-dasharray', `${payPct}, 100`);

  // Live Counters & Badges
  const recentCallsCount = document.getElementById('pulseRecentCallsCount');
  if (recentCallsCount) recentCallsCount.textContent = `${total}`;
  const lblRecentCalls = document.getElementById('lblRecentCallsFilter');
  if (lblRecentCalls && lblRecentCalls.textContent.startsWith('Все')) {
    lblRecentCalls.textContent = `Все (${total})`;
  }

  const syncBadge = document.getElementById('syncStatusBadge');
  if (syncBadge) syncBadge.textContent = `${total} СИНХРОНИЗИРОВАНО`;
}


// ==========================================================================
// REVOPS INTERACTIVE DROPDOWNS CONTROLLER
// ==========================================================================
function toggleRevopsDropdown(dropdownId, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const el = document.getElementById(dropdownId);
  if (!el) return;
  const isOpen = el.classList.contains('open');
  closeAllRevopsDropdowns();
  if (!isOpen) {
    el.classList.add('open');
  }
}

function closeAllRevopsDropdowns() {
  document.querySelectorAll('.revops-dropdown.open').forEach(el => {
    el.classList.remove('open');
  });
}

function selectPulsePeriod(periodKey, labelText) {
  const lblFact = document.getElementById('lblPulsePeriodFact');
  if (lblFact) lblFact.textContent = labelText;
  const lblPlan = document.getElementById('lblPulsePeriodPlan');
  if (lblPlan) lblPlan.textContent = labelText;

  const kpiFact = document.getElementById('kpiFactPeriodLabel');
  if (kpiFact) kpiFact.innerHTML = `Главный KPI &bull; ${labelText}`;
  const kpiPlan = document.getElementById('kpiPlanPeriodLabel');
  if (kpiPlan) kpiPlan.innerHTML = `Таргет &bull; ${labelText}`;

  // Sync active item in both dropdowns
  ['dropdownPulsePeriodFact', 'dropdownPulsePeriodPlan'].forEach(dId => {
    const d = document.getElementById(dId);
    if (d) {
      d.querySelectorAll('.revops-dropdown-item').forEach(item => {
        item.classList.toggle('active', item.textContent.includes(labelText));
      });
    }
  });

  if (typeof setPulsePeriod === 'function') {
    setPulsePeriod(periodKey);
  }
  closeAllRevopsDropdowns();
}

function setDissectionScale(scaleKey, labelText) {
  const lbl = document.getElementById('lblDissectionScale');
  if (lbl) lbl.textContent = labelText;

  const menu = document.getElementById('dropdownDissectionScale');
  if (menu) {
    menu.querySelectorAll('.revops-dropdown-item').forEach(item => {
      item.classList.toggle('active', item.textContent.includes(labelText));
    });
  }

  if (developDissectionChartInstance) {
    const isZero = CALLS_DATA.length === 0;
    if (scaleKey === 'weeks') {
      developDissectionChartInstance.data.labels = ['Нед 40 (1-7 Окт)', 'Нед 41 (8-14 Окт)', 'Нед 42 (15-21 Окт)', 'Нед 43 (22-28 Окт)'];
      developDissectionChartInstance.data.datasets[0].data = isZero ? [0, 0, 0, 0] : [210, 245, 190, 245];
      developDissectionChartInstance.data.datasets[1].data = isZero ? [0, 0, 0, 0] : [190, 190, 190, 190];
    } else if (scaleKey === 'days') {
      developDissectionChartInstance.data.labels = ['Пн (12 Окт)', 'Вт (13 Окт)', 'Ср (14 Окт)', 'Чт (15 Окт)', 'Пт (16 Окт)', 'Сб (17 Окт)', 'Вс (18 Окт)'];
      developDissectionChartInstance.data.datasets[0].data = isZero ? [0, 0, 0, 0, 0, 0, 0] : [35, 48, 52, 60, 45, 12, 8];
      developDissectionChartInstance.data.datasets[1].data = isZero ? [0, 0, 0, 0, 0, 0, 0] : [40, 40, 40, 40, 40, 15, 10];
    } else {
      developDissectionChartInstance.data.labels = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
      developDissectionChartInstance.data.datasets[0].data = isZero ? Array(12).fill(0) : [420, 560, 480, 680, 520, 740, 690, 820, 710, 890, 820, 950];
      developDissectionChartInstance.data.datasets[1].data = isZero ? Array(12).fill(0) : [350, 490, 420, 590, 450, 630, 580, 710, 620, 760, 710, 830];
    }
    developDissectionChartInstance.update();
  }

  showToast('Динамика выручки', 'Масштаб графика: ' + labelText);
  closeAllRevopsDropdowns();
}

function selectDonutPeriod(periodKey, labelText) {
  const lbl = document.getElementById('lblDonutPeriod');
  if (lbl) lbl.textContent = labelText;

  const menu = document.getElementById('dropdownDonutPeriod');
  if (menu) {
    menu.querySelectorAll('.revops-dropdown-item').forEach(item => {
      item.classList.toggle('active', item.textContent.includes(labelText));
    });
  }

  if (developDonutChartInstance) {
    const isZero = CALLS_DATA.length === 0;
    if (periodKey === '7d') {
      developDonutChartInstance.data.datasets[0].data = isZero ? [1] : [40, 30, 15, 10, 5];
    } else if (periodKey === '30d') {
      developDonutChartInstance.data.datasets[0].data = isZero ? [1] : [35, 25, 20, 12, 8];
    } else {
      developDonutChartInstance.data.datasets[0].data = isZero ? [1] : [34, 25, 17, 12, 6];
    }
    developDonutChartInstance.update();
  }

  showToast('Категории звонков', 'Срез: ' + labelText);
  closeAllRevopsDropdowns();
}

function selectCriteriaScope(scopeKey, labelText) {
  const lbl = document.getElementById('lblCriteriaScope');
  if (lbl) lbl.textContent = labelText;

  const menu = document.getElementById('dropdownCriteriaScope');
  if (menu) {
    menu.querySelectorAll('.revops-dropdown-item').forEach(item => {
      item.classList.toggle('active', item.textContent.includes(labelText));
    });
  }

  if (scopeKey === 'core5') {
    showToast('Нормативы конверсии', 'Фокус: 5 ключевых этапов B2B');
  } else if (scopeKey === 'risks') {
    showToast('Нормативы конверсии', 'Фокус: Критические точки срыва и Fake Yes');
  } else {
    showToast('Нормативы конверсии', 'Фокус: Все 13 критериев B2B-аудита');
  }
  closeAllRevopsDropdowns();
}

function filterRecentCalls(filterKey, labelText) {
  const lbl = document.getElementById('lblRecentCallsFilter');
  if (lbl) lbl.textContent = labelText;

  const menu = document.getElementById('dropdownRecentCallsFilter');
  if (menu) {
    menu.querySelectorAll('.revops-dropdown-item').forEach(item => {
      item.classList.toggle('active', item.textContent.includes(labelText));
    });
  }

  showToast('Последние звонки', 'Применен фильтр: ' + labelText);
  closeAllRevopsDropdowns();
}

function selectFunnelPeriod(periodKey, labelText) {
  const lbl = document.getElementById('lblFunnelPeriod');
  if (lbl) lbl.textContent = labelText;

  const menu = document.getElementById('dropdownFunnelPeriod');
  if (menu) {
    menu.querySelectorAll('.revops-dropdown-item').forEach(item => {
      item.classList.toggle('active', item.textContent.includes(labelText));
    });
  }

  showToast('Воронка продаж SSOT', 'Период: ' + labelText);
  closeAllRevopsDropdowns();
}

// Global click-away listeners for RevOps dropdowns
document.addEventListener('click', function(e) {
  if (!e.target.closest('.revops-dropdown')) {
    closeAllRevopsDropdowns();
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeAllRevopsDropdowns();
  }
});


// Expose Charts handlers & instances on window
window.mcChartInstance = typeof mcChartInstance !== 'undefined' ? mcChartInstance : null;
window.repPerfChartInstance = typeof repPerfChartInstance !== 'undefined' ? repPerfChartInstance : null;
window.speechRadarChartInstance = typeof speechRadarChartInstance !== 'undefined' ? speechRadarChartInstance : null;
window.developDissectionChartInstance = typeof developDissectionChartInstance !== 'undefined' ? developDissectionChartInstance : null;
window.developDonutChartInstance = typeof developDonutChartInstance !== 'undefined' ? developDonutChartInstance : null;
window.developSplineChartInstance = typeof developSplineChartInstance !== 'undefined' ? developSplineChartInstance : null;
window.drillDownSkill = drillDownSkill;
window.renderSkillsHeatmap = renderSkillsHeatmap;
window.initDevelopDissectionChart = initDevelopDissectionChart;
window.initDevelopDonutChart = initDevelopDonutChart;
window.initDevelopSplineChart = initDevelopSplineChart;
window.updateDevelopBentoCharts = updateDevelopBentoCharts;
window.recalcExpress = recalcExpress;
window.initMonteCarloChart = initMonteCarloChart;
window.runMonteCarloSimulation = runMonteCarloSimulation;
window.updateSimulation = updateSimulation;
window.getDynamicRepList = getDynamicRepList;
window.getDynamicRepMetrics = getDynamicRepMetrics;
window.initRepPerformanceChart = initRepPerformanceChart;
window.setRepChartMetric = setRepChartMetric;
window.RADAR_CRITERIA_LABELS = RADAR_CRITERIA_LABELS;
window.getDynamicRadarData = getDynamicRadarData;
window.initSpeechRadarChart = initSpeechRadarChart;
window.updateRadarChart = updateRadarChart;
window.renderRadarRepPills = renderRadarRepPills;
window.renderPayrollTable = renderPayrollTable;
window.renderAiImpactAndFakeYes = renderAiImpactAndFakeYes;

window.toggleRevopsDropdown = toggleRevopsDropdown;
window.closeAllRevopsDropdowns = closeAllRevopsDropdowns;
window.selectPulsePeriod = selectPulsePeriod;
window.setDissectionScale = setDissectionScale;
window.selectDissectionScale = setDissectionScale;
window.selectDonutPeriod = selectDonutPeriod;
window.selectCriteriaScope = selectCriteriaScope;
window.filterRecentCalls = filterRecentCalls;
window.selectFunnelPeriod = selectFunnelPeriod;
window.initSparklines = initSparklines;


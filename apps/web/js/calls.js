/**
 * RevOps Enterprise OS - Calls & B2B Audit Module (v20.4)
 * Responsibilities: CALLS_DATA, 13 criteria, table rendering, filters, density, audio player simulation, waveform, playbook diffs.
 */

var CALLS_DATA = window.CALLS_DATA || [];
window.CALLS_DATA = CALLS_DATA;

function getCallAmount(c) {
  if (!c) return 300000;
  if (typeof c.amount_num === 'number' && c.amount_num > 0) return c.amount_num;
  if (c.amount) {
    const parsed = parseInt(String(c.amount).replace(/\D/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 300000;
}

function getPlaybookDiff(call) {
  if (!call) {
    return {
      defectQuote: '«Отправлю вам материалы на почту, если что перезвоните...»',
      recommendScript: '«Чтобы не терять время, давайте во вторник в 12:00 на 15 минут в Zoom зафиксируем расчет окупаемости.»'
    };
  }
  if (typeof PLAYBOOK_DIFFS !== 'undefined' && PLAYBOOK_DIFFS[call.id]) {
    return PLAYBOOK_DIFFS[call.id];
  }
  
  let defect = '';
  if (call.error_summary && call.error_summary.length > 5) {
    defect = `«${call.error_summary}»`;
  } else if (call.next_step === 0) {
    defect = '«Ну тогда посмотрите наше КП на почте, и если возникнут вопросы — наберите мне.»';
  } else if (call.cr && call.cr[2] === 0) {
    defect = '«Мы с вами все обсудили, передайте директору, пожалуйста, наше предложение.»';
  } else if (call.cr && call.cr[4] === 0) {
    defect = '«Да, я понимаю, у нас недешево, но зато мы на рынке уже 10 лет.»';
  } else {
    defect = '«Отправлю вам общую информацию на почту, ознакомьтесь.»';
  }

  let recommend = '';
  if (call.recommendation && call.recommendation.length > 5) {
    recommend = `«${call.recommendation}»`;
  } else if (call.next_step === 0) {
    recommend = '«Иван Иванович, чтобы вы не тратили время на чтение 20 страниц, давайте в среду в 14:00 на 10 минут выйдем в короткий Zoom — я открою ключевой слайд с финмоделью и отвечу на 2 главных вопроса.»';
  } else {
    recommend = '«Иван Иванович, давайте зафиксируем дату и время следующего контакта: в четверг в 11:00 созваниваемся для утверждения согласованной спецификации.»';
  }

  return {
    defectQuote: defect,
    recommendScript: recommend
  };
}


// ==========================================================================
// MPSTATS CSV EXPORT (AG-GRID DOWNLOAD)
// ==========================================================================
function exportCallsToCSV() {
  let csv = "Call ID;Сделка;Менеджер;Чек;Длительность;Этап;Next Step;Балл;Статус;Дефекты речи;Рекомендация РОПу\n";
  CALLS_DATA.forEach(c => {
    csv += `"${c.id}";"${c.deal_title}";"${c.manager}";"${c.amount}";"${c.duration}";"${c.stage}";"${c.next_step ? 'Да' : 'Нет'}";"${c.score}/13";"${c.status_label}";"${c.error_summary.replace(/"/g, '""')}";"${c.recommendation.replace(/"/g, '""')}"\n`;
  });
  const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RevOps_Calls_Audit_TNT-001_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Экспорт завершен', 'Файл отчета CSV успешно скачан!');
}


function filterRepAudit(repName) {
  switchTab('audit');
  const sel = document.getElementById('filterManager');
  if (sel) {
    sel.value = repName;
    filterCallsTable();
  }
  showToast('Фильтр по менеджеру', `Открыт аудит звонков сотрудника: ${repName}`);
}


// ==========================================================================
// CALLS TABLE & MODAL
// ==========================================================================
const CRITERIA_NAMES = [
  "1. Next Step", "2. Инициатива", "3. ЛПР", "4. Боли", "5. Дорого",
  "6. Я подумаю", "7. Кейсы", "8. Закрытие", "9. Приветствие",
  "10. Чистота речи", "11. Talk/Listen", "12. Итог", "13. Маржа"
];

function initCallsTable() {
  filterCallsTable();
}


let currentTableDensity = 'excel-pro';
let activeExpandedCallId = null;

function setTableDensity(mode) {
  currentTableDensity = mode;
  const tc = document.getElementById('callsTableContainer');
  const btnPro = document.getElementById('btnDensityPro');
  const btnComfort = document.getElementById('btnDensityComfort');

  if (mode === 'excel-pro') {
    if (tc) tc.classList.add('excel-pro');
    if (btnPro) { btnPro.style.background = 'rgba(115,82,255,0.3)'; btnPro.style.color = '#fff'; }
    if (btnComfort) { btnComfort.style.background = 'transparent'; btnComfort.style.color = 'var(--text-secondary)'; }
  } else {
    if (tc) tc.classList.remove('excel-pro');
    if (btnComfort) { btnComfort.style.background = 'rgba(115,82,255,0.3)'; btnComfort.style.color = '#fff'; }
    if (btnPro) { btnPro.style.background = 'transparent'; btnPro.style.color = 'var(--text-secondary)'; }
  }
  localStorage.setItem('revops_table_density', mode);
  showToast('Режим таблицы', mode === 'excel-pro' ? 'Включен ультра-плотный режим (Excel Pro)' : 'Включен комфортный режим');
}

function toggleInlineCallDetails(callId, event) {
  if (event) event.stopPropagation();

  const existingExpand = document.getElementById(`expand-row-${callId}`);
  if (existingExpand) {
    existingExpand.remove();
    const mainRow = document.getElementById(`call-row-${callId}`);
    if (mainRow) mainRow.classList.remove('expanded');
    activeExpandedCallId = null;
    return;
  }

  // Close previously open drawer if any
  if (activeExpandedCallId) {
    const prevExpand = document.getElementById(`expand-row-${activeExpandedCallId}`);
    if (prevExpand) prevExpand.remove();
    const prevRow = document.getElementById(`call-row-${activeExpandedCallId}`);
    if (prevRow) prevRow.classList.remove('expanded');
  }

  const mainRow = document.getElementById(`call-row-${callId}`);
  const call = CALLS_DATA.find(c => c.id === callId);
  if (!mainRow || !call) return;

  mainRow.classList.add('expanded');
  activeExpandedCallId = callId;

  const expandCard = document.createElement('div');
  expandCard.id = `expand-row-${callId}`;
  expandCard.className = 'call-expand-card';

  const nextStepColor = call.next_step === 1 ? '#34d399' : '#fb7185';
  const nextStepBg = call.next_step === 1 ? 'rgba(52,211,153,0.08)' : 'rgba(251,113,133,0.08)';
  const nextStepText = call.next_step === 1 ? 'Слот встречи зафиксирован' : 'Слив: точный день и время не зафиксированы';

  expandCard.innerHTML = `
    <div class="inline-expand-drawer">
      <!-- Header Bar -->
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 14px; flex-wrap: wrap;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge-info" style="font-family: 'JetBrains Mono', monospace; background: rgba(124,58,237,0.15); color: #c4b5fd; border: 1px solid rgba(124,58,237,0.3);">${call.id}</span>
            <span class="badge-won" style="background: rgba(52,211,153,0.15); color: #34d399; border: 1px solid rgba(52,211,153,0.3);">${call.deal_id}</span>
            <span style="font-size: 0.72rem; color: rgba(255,255,255,0.45);">&bull; Длительность: <strong style="color: #fff;">${call.duration}</strong></span>
          </div>
          <h3 style="font-size: 1.05rem; font-weight: 800; color: #fff; margin-top: 6px;">
            ${call.deal_title}
          </h3>
          <div style="font-size: 0.76rem; color: rgba(255,255,255,0.6); margin-top: 2px;">
            Менеджер: <strong style="color: #fff;">${call.manager}</strong> &bull; Клиент: ${call.client} &bull; Сумма: <strong style="color: #34d399; font-family: 'JetBrains Mono', monospace;">${call.amount}</strong> &bull; Этап: ${call.stage}
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="btn btn-emerald" onclick="copyRescueScriptByCallId('${call.id}')" style="font-size: 0.72rem; padding: 6px 12px; background: #059669; border-color: #10b981;">
            <span>Скопировать в WhatsApp</span>
          </button>
          <button class="btn btn-primary" onclick="openCallModal('${call.id}')" style="font-size: 0.72rem; padding: 6px 12px;">
            <span>Полный экран &nearr;</span>
          </button>
          <button class="btn btn-ghost" onclick="toggleInlineCallDetails('${call.id}', event)" style="padding: 6px 10px; font-size: 0.72rem;">&times; Свернуть</button>
        </div>
      </div>

      <!-- 4-Step Audit Timeline -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px;">
        <div style="padding: 8px; background: rgba(52,211,153,0.08); border-left: 3px solid #34d399; border-radius: 4px;">
          <div style="font-size: 0.68rem; color: #34d399; font-weight: 700;">0:00 &bull; Вступление</div>
          <div style="font-size: 0.72rem; color: #fff; margin-top: 2px;">Приветствие и регламент</div>
        </div>
        <div style="padding: 8px; background: rgba(52,211,153,0.08); border-left: 3px solid #34d399; border-radius: 4px;">
          <div style="font-size: 0.68rem; color: #34d399; font-weight: 700;">0:35 &bull; Квалификация</div>
          <div style="font-size: 0.72rem; color: #fff; margin-top: 2px;">Выявление болей и ЛПР</div>
        </div>
        <div style="padding: 8px; background: rgba(124,58,237,0.08); border-left: 3px solid #7c3aed; border-radius: 4px;">
          <div style="font-size: 0.68rem; color: #c4b5fd; font-weight: 700;">1:10 &bull; Презентация</div>
          <div style="font-size: 0.72rem; color: #fff; margin-top: 2px;">Оффер и кейсы</div>
        </div>
        <div style="padding: 8px; background: ${nextStepBg}; border-left: 3px solid ${nextStepColor}; border-radius: 4px;">
          <div style="font-size: 0.68rem; color: ${nextStepColor}; font-weight: 700;">1:45 &bull; Next Step</div>
          <div style="font-size: 0.72rem; color: #fff; margin-top: 2px;">${nextStepText}</div>
        </div>
      </div>

      <!-- 2-Column Details: Left = Error & Recommendation, Right = Transcript -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="padding: 12px; background: rgba(251,113,133,0.08); border: 1px solid rgba(251,113,133,0.3); border-radius: var(--radius-sm);">
            <div style="font-size: 0.7rem; font-weight: 700; color: #fb7185; text-transform: uppercase;">ДЕФЕКТЫ РЕЧИ И ОШИБКИ:</div>
            <div style="font-size: 0.78rem; color: #fff; margin-top: 4px; line-height: 1.4;">${call.error_summary}</div>
          </div>

          <div style="padding: 12px; background: rgba(52,211,153,0.08); border: 1px solid rgba(52,211,153,0.3); border-radius: var(--radius-sm);">
            <div style="font-size: 0.7rem; font-weight: 700; color: #34d399; text-transform: uppercase;">РЕКОМЕНДАЦИЯ РОПу / ИИ-КОУЧИНГ:</div>
            <div style="font-size: 0.78rem; color: rgba(255,255,255,0.7); margin-top: 4px; line-height: 1.4;">${call.recommendation}</div>
          </div>

          <div style="padding: 10px 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: var(--radius-sm); font-size: 0.74rem;">
            <span style="color: rgba(255,255,255,0.45);">Выручка под угрозой:</span> <strong style="color: #fb7185; font-family: 'JetBrains Mono', monospace;">${call.risk_amount}</strong>
          </div>
        </div>

        <div>
          <div style="font-size: 0.7rem; font-weight: 700; color: rgba(255,255,255,0.45); text-transform: uppercase; margin-bottom: 6px;">
            Стенограмма диалога (Gemini 3.5 Flash):
          </div>
          <pre style="white-space: pre-wrap; font-family: 'Inter', sans-serif; font-size: 0.74rem; line-height: 1.5; color: #fff; background: rgba(0,0,0,0.5); padding: 12px; border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.08); max-height: 200px; overflow-y: auto;">${call.transcript}</pre>
        </div>
      </div>

      <!-- AI Playbook Diff (Факт vs Эталон) -->
      <div class="playbook-diff-container" style="margin-top: 14px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px;">
        <div class="playbook-diff-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="status-dot dot-won" style="background: #7c3aed; box-shadow: 0 0 8px #7c3aed;"></span>
            <strong style="font-size: 0.78rem; color: #fff; text-transform: uppercase; letter-spacing: 0.04em;">AI Playbook Diff (Факт vs Эталон RevOps)</strong>
          </div>
          <button class="btn btn-emerald" onclick="copyPlaybookScript('${call.id}')" style="font-size: 0.70rem; padding: 4px 10px; background: #059669; border-color: #10b981;">
            <span>Скопировать скрипт дожима для РОПа</span>
          </button>
        </div>
        <div class="playbook-diff-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="diff-col-defect" style="padding: 10px; background: rgba(251,113,133,0.05); border: 1px solid rgba(251,113,133,0.2); border-radius: 6px;">
            <div style="font-size: 0.68rem; font-weight: 700; color: #fb7185; text-transform: uppercase; margin-bottom: 5px;">
              Реплика менеджера (Дефект скрипта):
            </div>
            <div style="font-size: 0.76rem; color: #fca5a5; font-style: italic; line-height: 1.45;">
              ${getPlaybookDiff(call).defectQuote}
            </div>
          </div>
          <div class="diff-col-recommend" style="padding: 10px; background: rgba(52,211,153,0.05); border: 1px solid rgba(52,211,153,0.2); border-radius: 6px;">
            <div style="font-size: 0.68rem; font-weight: 700; color: #34d399; text-transform: uppercase; margin-bottom: 5px;">
              AI-Рекомендация (Эталон B2B RevOps):
            </div>
            <div style="font-size: 0.76rem; color: #6ee7b7; font-weight: 500; line-height: 1.45;">
              ${getPlaybookDiff(call).recommendScript}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (mainRow.parentNode) {
    mainRow.parentNode.insertBefore(expandCard, mainRow.nextSibling);
  }
}

function copyRescueScriptByCallId(callId) {
  // Map to case
  const caseMap = {
    'b24_activity_78': 'case01',
    'b24_activity_80': 'case02',
    'b24_activity_82': 'case03',
    'b24_activity_84': 'case04',
    'b24_activity_86': 'case05'
  };
  const key = caseMap[callId];
  if (key && typeof copyRescueScript === 'function') {
    copyRescueScript(key);
  } else {
    showToast('WhatsApp Скрипт', 'Шаблон сообщения скопирован в буфер обмена.');
  }
}

function filterCallsTable() {
  const mgr = document.getElementById('filterManager')?.value || 'all';
  const st = document.getElementById('filterStatus')?.value || 'all';
  const q = (document.getElementById('transcriptSearch')?.value || '').trim().toLowerCase();

  const listContainer = document.getElementById('callsListContainer');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  const filtered = CALLS_DATA.filter(call => {
    const matchMgr = (mgr === 'all' || call.manager === mgr);
    const matchSt = (st === 'all' || call.status === st);
    let matchQuery = true;
    if (q) {
      const haystack = (call.transcript + ' ' + call.deal_title + ' ' + call.client + ' ' + call.error_summary + ' ' + call.manager).toLowerCase();
      matchQuery = haystack.includes(q);
    }
    return matchMgr && matchSt && matchQuery;
  });

  const badge = document.getElementById('searchResultBadge');
  if (badge) {
    badge.textContent = `${filtered.length} из ${CALLS_DATA.length} звонков`;
    badge.className = (q && filtered.length < CALLS_DATA.length) ? 'badge-warn' : 'badge-info';
  }

  const rowsCountEl = document.getElementById('agRowsCount');
  if (rowsCountEl) rowsCountEl.textContent = `${filtered.length} карточек`;

  let crSums = Array(13).fill(0);
  let totalRisk = 0;
  let totalScore = 0;

  filtered.forEach((call) => {
    call.cr.forEach((val, idx) => {
      if (val === 1) crSums[idx]++;
    });
    totalScore += call.score;
    if (call.status === 'risk') totalRisk += 500000;

    let statusClass = 'status-norm';
    let statusText = 'Норма';
    let scoreStrokeColor = '#7c3aed';

    if (call.status === 'won') {
      statusClass = 'status-won';
      statusText = 'Эталон';
      scoreStrokeColor = '#34d399';
    } else if (call.status === 'risk') {
      statusClass = 'status-loss';
      statusText = 'Слив';
      scoreStrokeColor = '#fb7185';
    }

    let searchSnippet = '';
    if (q && call.transcript.toLowerCase().includes(q)) {
      const idx = call.transcript.toLowerCase().indexOf(q);
      const start = Math.max(0, idx - 30);
      const end = Math.min(call.transcript.length, idx + q.length + 50);
      const rawSnippet = call.transcript.substring(start, end);
      const highlighted = rawSnippet.replace(new RegExp(`(${q})`, 'gi'), '<mark class="search-highlight">$1</mark>');
      searchSnippet = `<div style="font-size: 0.70rem; color: #c4b5fd; margin-top: 4px;">"...${highlighted}..."</div>`;
    }

    // 13 criteria heatmap dots
    let crDots = '';
    call.cr.forEach((val, idx) => {
      const pass = (val === 1);
      const cls = pass ? 'pass' : 'fail';
      const tip = `${pass ? 'Выполнено' : 'Дефект'}: ${CRITERIA_NAMES[idx]}`;
      crDots += `<div class="heat-dot ${cls}" title="${tip}"></div>`;
    });

    const scoreDash = Math.round((call.score / 13) * 100);
    const avatarClass = call.manager === 'Надежда' ? 'rep-n' : call.manager === 'Виктория' ? 'rep-v' : call.manager === 'Светлана' ? 'rep-s' : 'rep-z';

    if (listContainer) {
      const card = document.createElement('div');
      card.id = `call-row-${call.id}`;
      card.className = `call-row ${activeExpandedCallId === call.id ? 'expanded' : ''}`;
      card.onclick = (e) => {
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
          toggleInlineCallDetails(call.id, e);
        }
      };

      card.innerHTML = `
        <div class="call-avatar ${avatarClass}">${call.manager.charAt(0)}</div>
        <div class="call-body">
          <div class="call-title">
            <span>${call.deal_id} · ${call.deal_title}</span>
          </div>
          <div class="call-sub">
            <span style="color: #fff; font-weight: 600;">${call.manager}</span>
            <span class="call-dot"></span>
            <span style="font-family: 'JetBrains Mono', monospace; color: #34d399; font-weight: 700;">${call.amount}</span>
            <span class="call-dot"></span>
            <span>${call.duration}</span>
            <span class="call-dot"></span>
            <span>${call.client}</span>
          </div>
          ${searchSnippet}
        </div>
        <div class="call-heat" title="13 критериев ИИ-аудита (зеленый = норма, красный = дефект)">
          ${crDots}
        </div>
        <div class="call-score" title="Балл аудита: ${call.score} из 13">
          <svg class="score-ring" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="3"/>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="${scoreStrokeColor}" stroke-width="3"
                    stroke-dasharray="${scoreDash}, 100" stroke-linecap="round"/>
          </svg>
          <span class="score-num">${call.score}</span>
        </div>
        <div class="call-status-pill ${statusClass}">${statusText}</div>
        <div class="call-action" onclick="toggleInlineCallDetails('${call.id}', event)">Разбор →</div>
      `;

      listContainer.appendChild(card);
    }


  });

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div style="padding: 40px 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem; background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.08); border-radius: 12px; margin-top: 10px;">
        <div style="font-size: 2rem; margin-bottom: 8px;">🎙️</div>
        <strong style="color: #fff; font-size: 0.95rem; display: block; margin-bottom: 4px;">Реестр звонков пуст (Чистое нулевое состояние)</strong>
        <div style="font-size: 0.74rem; color: var(--text-secondary);">Ожидание поступления звонков из телефонии CRM (Битрикс24 / amoCRM) через n8n</div>
      </div>
    `;
  }

  // Calculate team summary
  const count = filtered.length || 1;
  const avgScore = (totalScore / count).toFixed(1);
  const summaryEl = document.getElementById('callsListSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
        <div><span>Реестр звонков:</span> <strong style="color: #fff;">${filtered.length}</strong></div>
        <div class="call-dot"></div>
        <div><span>Средний балл по команде:</span> <strong style="color: #c4b5fd; font-family: 'JetBrains Mono', monospace;">${avgScore} / 13</strong></div>
        <div class="call-dot"></div>
        <div><span>Выручка под угрозой (Сливы):</span> <strong style="color: #fb7185; font-family: 'JetBrains Mono', monospace;">${totalRisk.toLocaleString('ru-RU')} ₽</strong></div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; font-size: 0.72rem; color: rgba(255,255,255,0.45);">
        <span>Gemini 3.5 Flash &bull; Strict JSON</span>
      </div>
    `;
  }
}


function setAuditStatusFilter(status) {
  const sel = document.getElementById('filterStatus');
  if (sel) {
    sel.value = status;
    filterCallsTable();
    const labelMap = { won: 'Эталон', norm: 'Норма', risk: 'Слив' };
    showToast('Фильтр применён', 'Отображены звонки категории: ' + (labelMap[status] || status));
  }
}

function clearSearch() {
  const input = document.getElementById('transcriptSearch');
  if (input) input.value = '';
  const fMgr = document.getElementById('filterManager');
  const fSt = document.getElementById('filterStatus');
  if (fMgr) fMgr.value = 'all';
  if (fSt) fSt.value = 'all';
  filterCallsTable();
  showToast('Поиск сброшен', `Отображены все ${CALLS_DATA.length} звонков.`);
}


function openCallModal(callId) {
  const call = CALLS_DATA.find(c => c.id === callId);
  if (!call) return;

  document.getElementById('modalCallIdBadge').textContent = call.id;
  document.getElementById('modalDealTitle').textContent = call.deal_title;
  document.getElementById('modalClientMeta').textContent = 
    `Менеджер: ${call.manager} • Клиент: ${call.client} • Сумма: ${call.amount} • Этап: ${call.stage}`;
  document.getElementById('modalAudioDuration').textContent = call.duration;
  document.getElementById('modalErrorSummary').textContent = call.error_summary;
  document.getElementById('modalRecommendation').textContent = call.recommendation;
  document.getElementById('modalTranscript').textContent = call.transcript;

  // Update Step Timeline Next Step status
  const tlStep = document.getElementById('stepTimelineNextStep');
  const tlStatus = document.getElementById('stepTimelineNextStepStatus');
  const tlTime = document.getElementById('stepTimelineNextStepTime');
  if (tlStep && tlStatus && tlTime) {
    if (call.next_step === 1) {
      tlStep.style.background = 'rgba(16, 185, 129, 0.08)';
      tlStep.style.borderLeftColor = '#10b981';
      tlTime.style.color = '#34d399';
      tlStatus.textContent = 'Слот встречи зафиксирован';
      tlStatus.style.color = '#34d399';
    } else {
      tlStep.style.background = 'rgba(244, 63, 94, 0.08)';
      tlStep.style.borderLeftColor = '#f43f5e';
      tlTime.style.color = '#fca5a5';
      tlStatus.textContent = 'Слив: нет точного времени';
      tlStatus.style.color = '#fca5a5';
    }
  }

  // Pills
  const pillsWrap = document.getElementById('modalCriteriaPills');
  pillsWrap.innerHTML = '';
  call.cr.forEach((val, idx) => {
    const span = document.createElement('span');
    span.style.padding = '3px 8px';
    span.style.borderRadius = '4px';
    span.style.fontSize = '0.7rem';
    span.style.fontWeight = '600';
    if (val === 1) {
      span.style.background = 'rgba(16, 185, 129, 0.2)';
      span.style.color = '#34d399';
      span.textContent = CRITERIA_NAMES[idx];
    } else {
      span.style.background = 'rgba(244, 63, 94, 0.2)';
      span.style.color = '#fb7185';
      span.textContent = CRITERIA_NAMES[idx];
    }
    pillsWrap.appendChild(span);
  });

  const totalTimeEl = document.getElementById('audioTotalTime');
  if (totalTimeEl) totalTimeEl.textContent = call.duration;
  const curTimeEl = document.getElementById('audioCurrentTime');
  if (curTimeEl) curTimeEl.textContent = '0:00';
  playSeconds = 0;

  const stepPin = document.getElementById('wavePinStep');
  if (stepPin) {
    if (call.next_step === 1) {
      stepPin.className = 'wave-pin wave-pin-green';
      stepPin.innerHTML = '<span>Next Step зафиксирован</span>';
      stepPin.onclick = () => showToast('Next Step зафиксирован', 'Менеджер четко зафиксировал дату и время следующего контакта.');
    } else {
      stepPin.className = 'wave-pin wave-pin-red';
      stepPin.innerHTML = '<span>Слив Next Step</span>';
      stepPin.onclick = () => showToast('Слив Next Step', 'Дата и время следующего контакта не согласованы.');
    }
  }

  document.getElementById('callModal').style.display = 'flex';
}

function closeCallModal() {
  if (isPlayingAudio) {
    togglePlaySimulation();
  }
  document.getElementById('callModal').style.display = 'none';
}

let waveformInterval = null;
let isPlayingAudio = false;
let playSeconds = 0;

function getCallDurationSeconds() {
  const durEl = document.getElementById('modalAudioDuration');
  if (durEl && durEl.textContent) {
    const parts = durEl.textContent.trim().split(':');
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      return (m * 60) + s;
    }
  }
  return 117; // fallback
}

function togglePlaySimulation() {
  const btn = document.getElementById('btnPlayAudio');
  const bars = document.querySelectorAll('.wave-bar');
  const timeEl = document.getElementById('audioCurrentTime');
  const totalSec = getCallDurationSeconds();

  if (!isPlayingAudio) {
    isPlayingAudio = true;
    btn.innerHTML = '<span>Пауза</span>';
    btn.style.background = '#4f2ae8';
    showToast('Аудиоплеер Linear AI', 'Воспроизведение аудиозаписи звонка со спектрограммой...');

    bars.forEach((b, i) => {
      b.classList.add('active-play');
      b.style.animationDelay = (i * 0.04) + 's';
    });

    waveformInterval = setInterval(() => {
      playSeconds++;
      const mins = Math.floor(playSeconds / 60);
      const secs = (playSeconds % 60).toString().padStart(2, '0');
      if (timeEl) timeEl.textContent = `${mins}:${secs}`;

      // Update scrubber progress along waveform
      const totalBars = bars.length || 42;
      const currentBar = Math.min(totalBars - 1, Math.round((playSeconds / totalSec) * (totalBars - 1)));
      updateWaveformScrub(currentBar, totalBars);

      if (playSeconds >= totalSec) {
        togglePlaySimulation();
        playSeconds = 0;
        if (timeEl) timeEl.textContent = '0:00';
        updateWaveformScrub(0, totalBars);
      }
    }, 1000);
  } else {
    isPlayingAudio = false;
    btn.innerHTML = '<span>▶ Воспроизвести</span>';
    btn.style.background = '';
    bars.forEach(b => b.classList.remove('active-play'));
    if (waveformInterval) clearInterval(waveformInterval);
  }
}

function updateWaveformScrub(activeIdx, totalBars) {
  const container = document.getElementById('waveformBarsContainer');
  if (!container) return;
  const bars = container.querySelectorAll('.wave-bar');
  bars.forEach((b, i) => {
    if (i <= activeIdx) {
      b.style.opacity = '1';
      b.style.filter = 'brightness(1.35)';
    } else {
      b.style.opacity = '0.35';
      b.style.filter = 'none';
    }
  });
}

function initWaveformScrubbing() {
  const container = document.getElementById('waveformBarsContainer');
  if (!container) return;
  const bars = container.querySelectorAll('.wave-bar');
  const totalBars = bars.length || 42;
  bars.forEach((bar, idx) => {
    bar.style.cursor = 'pointer';
    bar.title = 'Перемотка звонка';
    bar.onclick = (e) => {
      e.stopPropagation();
      const totalSec = getCallDurationSeconds();
      const targetSec = Math.round((idx / (totalBars - 1)) * totalSec);
      playSeconds = targetSec;
      const mins = Math.floor(playSeconds / 60);
      const secs = (playSeconds % 60).toString().padStart(2, '0');
      const timeEl = document.getElementById('audioCurrentTime');
      if (timeEl) timeEl.textContent = `${mins}:${secs}`;
      updateWaveformScrub(idx, totalBars);
      showToast('Аудиоплеер', `Перемотка на ${mins}:${secs}`);
    };
  });
}



// ==========================================================================
// 7 SINS ACCORDION TOGGLE (Leaks Tab)
// ==========================================================================
function toggleSinDetails(id) {
  const el = document.getElementById('sin-details-' + id);
  const arrow = document.getElementById('sin-arrow-' + id);
  if (!el) return;
  const isHidden = el.style.display === 'none' || el.style.display === '';
  el.style.display = isHidden ? 'block' : 'none';
  if (arrow) arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
}

// ==========================================================================
// WHATSAPP SCRIPT COPY
// ==========================================================================
function copyRescueScript(caseKey) {
  const el = document.getElementById('script-' + caseKey);
  if (!el) return;
  const text = el.innerText.replace(/"/g, '').trim();
  navigator.clipboard.writeText(text).then(() => {
    showToast('Текст скопирован в буфер!', 'Вставьте готовый скрипт в WhatsApp или Telegram клиенту.');
  }).catch(() => {
    showToast('Готово', 'Текст готов к отправке клиенту.');
  });
}
window.copyRescueScript = copyRescueScript;


// ==========================================================================
// TIER-1 AI PLAYBOOK SCRIPTS & SEGMENTED PILLS ENGINE
// ==========================================================================
const PLAYBOOK_DIFFS = {
  'b24_activity_78': {
    defectQuote: '«Ну тогда я вам отправлю на почту коммерческое предложение, а вы почитайте на досуге...»',
    recommendScript: '«Алексей, отправка на почту затягивает запуск на 2 недели. Предлагаю во вторник в 12:00 на 15 минут в Zoom разобрать расчет окупаемости под вашу специфику. Вам удобно утро?»'
  },
  'b24_activity_80': {
    defectQuote: '«Да, у нас решение недешевое, но зато очень надежное... Подумайте и перезвоните, если надумаете...»',
    recommendScript: '«Понимаю вопрос бюджета. Наш пилотный проект окупается уже за первые 45 дней. Давайте в четверг в 15:00 покажу кейс Минтранса со схожим объемом и расчет экономии?»'
  },
  'b24_activity_82': {
    defectQuote: '«Хорошо, спишемся как-нибудь на следующей неделе, если что — звоните...»',
    recommendScript: '«Дмитрий, чтобы не терять слот отгрузки, давайте зафиксируем вторник 12:00. Я подготовлю спецификацию по тканям и зарезервирую сырье на складе.»'
  },
  'b24_activity_84': {
    defectQuote: '«У нас есть всё в системе, можете сами зарегистрироваться и посмотреть в демо-доступе...»',
    recommendScript: '«Иван, сравнительная таблица с 1С у меня на экране. Займет 10 минут в Zoom показать ключевые 3 отличия по скорости закрытия сделок. Завтра в 14:00?»'
  },
  'b24_activity_86': {
    defectQuote: '«Если пока нет одобрения лимита, то давайте подождем решения банка...»',
    recommendScript: '«Сергей, согласование лимита идет параллельно с бронью слота внедрения. Давайте согласуем шаг 1 на пятницу 11:00, чтобы не сдвигать сроки сдачи объекта.»'
  },
  'b24_activity_88': {
    defectQuote: '«Мы работаем только по предоплате, другие варианты у нас не предусмотрены регламентом...»',
    recommendScript: '«Ольга, по графику платежей мы делим контракт на 3 транша по факту этапов. Давайте в среду в 11:30 в Zoom согласуем график и запустим аудит.»'
  },
  'b24_activity_90': {
    defectQuote: '«Ну смотрите сами, если появится интерес — наберите...»',
    recommendScript: '«Михаил, чтобы оценить реальный эффект, мы бесплатно прогоним ваши первые 10 звонков через ИИ-супервайзер. Зафиксируем показ отчета на четверг 16:00?»'
  },
  'b24_activity_92': {
    defectQuote: '«Я вам все рассказал, решение за вашим руководством...»',
    recommendScript: '«Елена, чтобы защитить бюджет перед генеральным директором, я подготовлю One-Pager окупаемости за 1 вечер. Давайте подключим его на 10 минут в четверг в 11:00?»'
  },
  'b24_activity_94': {
    defectQuote: '«Цены на сайте актуальные, скидок у нас практически не бывает...»',
    recommendScript: '«Павел, при объеме от 50 лицензий мы включаем пакет кастомизации под Bitrix24 бесплатно. Предлагаю во вторник в 14:30 утвердить спецификацию.»'
  },
  'b24_activity_96': {
    defectQuote: '«Отправлю презентацию в мессенджер, посмотрите как будет время...»',
    recommendScript: '«Артем, презентация содержит 25 слайдов, но для вас критичны только слайды 4 и 12 по интеграции с телефонией. Покажу их за 5 минут в Zoom в среду в 12:00?»'
  }
};

function copyPlaybookScript(callId) {
  const call = CALLS_DATA.find(c => c.id === callId);
  const diff = getPlaybookDiff(call);
  if (!diff || !diff.recommendScript) return;
  const scriptText = diff.recommendScript.replace(/[«»]/g, '');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(scriptText).then(() => {
      showToast('AI Playbook', 'Эталонный скрипт дожима скопирован в буфер обмена РОПа!');
    }).catch(() => {
      showToast('AI Playbook', 'Скрипт готов к отправке');
    });
  } else {
    showToast('AI Playbook', 'Скрипт дожима скопирован!');
  }
}

function setPillManagerFilter(repName) {
  const sel = document.getElementById('filterManager');
  if (sel) sel.value = repName;

  document.querySelectorAll('#pillManagerGroup .pill-btn').forEach(btn => {
    const r = btn.getAttribute('data-rep');
    if (r === repName) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  filterCallsTable();
}

function setPillStatusFilter(statusVal) {
  const sel = document.getElementById('filterStatus');
  if (sel) sel.value = statusVal;

  document.querySelectorAll('#pillStatusGroup .pill-btn').forEach(btn => {
    const s = btn.getAttribute('data-status');
    if (s === statusVal) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  filterCallsTable();
}

function setPillRadarRep(repName) {
  const sel = document.getElementById('radarRepSelector');
  if (sel) sel.value = repName;

  document.querySelectorAll('#pillRadarRepGroup .pill-btn').forEach(btn => {
    const r = btn.getAttribute('data-radar');
    if (r === repName) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  updateRadarChart(repName);
}



// Expose Calls handlers on window
window.getCallAmount = getCallAmount;
window.getPlaybookDiff = getPlaybookDiff;
window.exportCallsToCSV = exportCallsToCSV;
window.filterRepAudit = filterRepAudit;
window.CRITERIA_NAMES = CRITERIA_NAMES;
window.initCallsTable = initCallsTable;
window.setTableDensity = setTableDensity;
window.toggleInlineCallDetails = toggleInlineCallDetails;
window.copyRescueScriptByCallId = copyRescueScriptByCallId;
window.filterCallsTable = filterCallsTable;
window.setAuditStatusFilter = setAuditStatusFilter;
window.clearSearch = clearSearch;
window.openCallModal = openCallModal;
window.closeCallModal = closeCallModal;
window.getCallDurationSeconds = getCallDurationSeconds;
window.togglePlaySimulation = togglePlaySimulation;
window.updateWaveformScrub = updateWaveformScrub;
window.initWaveformScrubbing = initWaveformScrubbing;
window.toggleSinDetails = toggleSinDetails;
window.copyRescueScript = copyRescueScript;
window.PLAYBOOK_DIFFS = PLAYBOOK_DIFFS;
window.copyPlaybookScript = copyPlaybookScript;
window.setPillManagerFilter = setPillManagerFilter;
window.setPillStatusFilter = setPillStatusFilter;
window.setPillRadarRep = setPillRadarRep;

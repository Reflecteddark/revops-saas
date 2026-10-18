/**
 * RevOps Enterprise OS - Settings & Business Configuration SSOT (v20.4)
 * Responsibilities: 28 business configuration parameters, revenue targets, presets, 19 module toggles, backend sync.
 */

// ==========================================================================
// 28 PARAMETERS & BUSINESS CONFIGURATION MODULE (V20.2 SSOT)
// ==========================================================================
let SYSTEM_SETTINGS = null;

function getMonthlyTarget() {
  if (SYSTEM_SETTINGS && SYSTEM_SETTINGS.general && Number(SYSTEM_SETTINGS.general.monthly_target) > 0) {
    return Number(SYSTEM_SETTINGS.general.monthly_target);
  }
  return 5000000;
}

async function fetchAndPopulateSettings(forceToast = false) {
  const syncBadge = document.getElementById('settingsSyncStatus');
  if (syncBadge) {
    syncBadge.textContent = 'СИНХРОНИЗАЦИЯ...';
    syncBadge.className = 'badge-risk';
  }
  try {
    const tenantId = getActiveTenantId();
    const res = await fetch(`${REVOPS_API_BASE}/api/v1/settings?tenant_id=${encodeURIComponent(tenantId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    SYSTEM_SETTINGS = data;

    // 1. General & Period
    const g = data.general || {};
    const inpTarget = document.getElementById('cfgMonthlyTarget');
    const inpStart = document.getElementById('cfgPeriodStart');
    const inpEnd = document.getElementById('cfgPeriodEnd');
    const inpCompany = document.getElementById('cfgCompanyName');
    const selCurrency = document.getElementById('cfgCurrency');

    if (inpTarget && g.monthly_target) inpTarget.value = g.monthly_target;
    if (inpStart && g.period_start) inpStart.value = g.period_start;
    if (inpEnd && g.period_end) inpEnd.value = g.period_end;
    if (inpCompany && g.company_name) inpCompany.value = g.company_name;
    if (selCurrency && g.currency) selCurrency.value = g.currency;

    // 2. Stages (7 stages)
    const stagesBody = document.getElementById('cfgStagesTableBody');
    if (stagesBody && data.stages && data.stages.length) {
      stagesBody.innerHTML = data.stages.map((st) => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);" data-stage-id="${st.id}">
          <td style="padding: 8px; color: var(--text-muted); font-family: monospace;">${st.id}</td>
          <td style="padding: 8px; font-weight: 600; color: #fff;">
            <input type="text" class="cfg-inline-input cfg-stage-name" value="${st.name}" style="font-weight: 600;">
          </td>
          <td style="padding: 8px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <input type="number" class="cfg-inline-input cfg-stage-sla" value="${st.sla_hours}" min="0" max="720" style="width: 70px;">
              <span style="color: var(--text-muted); font-size: 0.72rem;">ч</span>
            </div>
          </td>
          <td style="padding: 8px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <input type="number" class="cfg-inline-input cfg-stage-win" value="${st.win_pct}" min="0" max="100" style="width: 70px;">
              <span style="color: var(--text-muted); font-size: 0.72rem;">%</span>
            </div>
          </td>
          <td style="padding: 8px; font-size: 0.72rem; color: var(--text-secondary);">
            ${st.win_pct >= 80 ? '🟢 Высокая конверсия' : (st.win_pct > 20 ? '🟡 Рабочий цикл' : '⚪ Начало воронки')}
          </td>
        </tr>
      `).join('');
    }

    // 3. Managers (Capacity)
    const mgrsBody = document.getElementById('cfgManagersTableBody');
    if (mgrsBody && data.managers && data.managers.length) {
      mgrsBody.innerHTML = data.managers.map((m) => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);" data-mgr-id="${m.id}">
          <td style="padding: 8px; color: var(--text-muted); font-family: monospace;">${m.id}</td>
          <td style="padding: 8px; font-weight: 600; color: #fff;">
            <input type="text" class="cfg-inline-input cfg-mgr-name" value="${m.name}" style="font-weight: 600;">
          </td>
          <td style="padding: 8px; color: var(--text-secondary);">
            <input type="text" class="cfg-inline-input cfg-mgr-role" value="${m.role}">
          </td>
          <td style="padding: 8px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <input type="number" class="cfg-inline-input cfg-mgr-capacity" value="${m.capacity}" min="5" max="200" style="width: 80px;">
              <span style="color: var(--text-muted); font-size: 0.72rem;">сделок</span>
            </div>
          </td>
          <td style="padding: 8px; font-size: 0.72rem;">
            <span class="badge-won" style="font-size: 0.68rem;">🟢 В НОРМЕ (CAPACITY OK)</span>
          </td>
        </tr>
      `).join('');
    }

    // 4. Loss reasons (L1..L4)
    const lossBody = document.getElementById('cfgLossReasonsTableBody');
    if (lossBody && data.loss_reasons && data.loss_reasons.length) {
      lossBody.innerHTML = data.loss_reasons.map((lr) => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);" data-loss-code="${lr.code}">
          <td style="padding: 6px; font-weight: 700; color: #fb7185; font-family: monospace;">${lr.code}</td>
          <td style="padding: 6px; color: #fff;">
            <input type="text" class="cfg-inline-input cfg-loss-reason" value="${lr.reason}">
          </td>
          <td style="padding: 6px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <input type="number" class="cfg-inline-input cfg-loss-prob" value="${lr.reactivation_prob}" min="0" max="100" style="width: 60px;">
              <span style="color: var(--text-muted); font-size: 0.72rem;">%</span>
            </div>
          </td>
        </tr>
      `).join('');
    }

    // 5. Telegram
    const tg = data.telegram || {};
    const inpRop = document.getElementById('cfgRopChatId');
    const inpCeo = document.getElementById('cfgCeoChatId');
    const inpTeam = document.getElementById('cfgTeamChatId');
    const chkDisp = document.getElementById('cfgDispatcherStatus');
    const tgBadge = document.getElementById('cfgTgStatusBadge');

    if (inpRop && tg.rop_chat_id) inpRop.value = tg.rop_chat_id;
    if (inpCeo && tg.ceo_chat_id) inpCeo.value = tg.ceo_chat_id;
    if (inpTeam && tg.team_chat_id) inpTeam.value = tg.team_chat_id;
    if (chkDisp) {
      chkDisp.checked = Boolean(tg.dispatcher_status);
      if (tgBadge) {
        tgBadge.textContent = chkDisp.checked ? '🟢 ACTIVE' : '🔴 OFF';
        tgBadge.className = chkDisp.checked ? 'badge-won' : 'badge-risk';
      }
    }

    // 6. 19 Modules
    const modGrid = document.getElementById('cfgModulesGrid');
    if (modGrid && data.modules && data.modules.length) {
      modGrid.innerHTML = data.modules.map(mod => `
        <div class="module-card" data-module-code="${mod.code}">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <span style="font-family: monospace; font-size: 0.7rem; color: #38bdf8; background: rgba(56,189,248,0.1); padding: 2px 6px; border-radius: 4px;">${mod.code}</span>
              <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">${mod.category || 'CRM'}</span>
            </div>
            <div style="font-size: 0.78rem; font-weight: 700; color: #fff; line-height: 1.3; margin-bottom: 4px;">
              ${mod.name}
            </div>
            <div style="font-size: 0.68rem; color: var(--text-secondary); line-height: 1.3;">
              ${mod.description || ''}
            </div>
          </div>
          <label class="setting-switch" style="margin-top: 2px;">
            <input type="checkbox" class="cfg-module-toggle" ${mod.status ? 'checked' : ''}>
            <span class="setting-slider"></span>
          </label>
        </div>
      `).join('');
    }

    if (syncBadge) {
      syncBadge.textContent = 'СИНХРОНИЗИРОВАНО';
      syncBadge.className = 'badge-won';
    }

    refreshTargetDisplay();

    if (forceToast) {
      showToast('Настройки загружены', 'Все 28 параметров актуализированы из Google Таблицы');
    }
  } catch (err) {
    console.error('Error fetching settings:', err);
    if (syncBadge) {
      syncBadge.textContent = 'ОШИБКА СИНХРОНИЗАЦИИ';
      syncBadge.className = 'badge-risk';
    }
  }
}

function refreshTargetDisplay() {
  const target = getMonthlyTarget();
  const metricPlan = document.getElementById('metricPlanVal');
  if (metricPlan) {
    metricPlan.textContent = `${target.toLocaleString('ru-RU')} ₽`;
  }
  const onePagerTarget = document.querySelector('#onePagerModal .modal-box div div strong');
  if (typeof refreshAllDashboardViews === 'function') {
    refreshAllDashboardViews();
  }
}

async function submitSystemSettingsForm() {
  const btnTop = document.getElementById('btnSaveSettingsTop');
  const btnBottom = document.getElementById('btnSaveSettingsBottom');
  const syncBadge = document.getElementById('settingsSyncStatus');

  if (btnTop) btnTop.disabled = true;
  if (btnBottom) btnBottom.disabled = true;
  if (syncBadge) {
    syncBadge.textContent = 'СОХРАНЕНИЕ В GOOGLE ТАБЛИЦУ...';
    syncBadge.className = 'badge-risk';
  }

  try {
    const targetVal = Number(document.getElementById('cfgMonthlyTarget')?.value) || 5000000;
    const periodStart = document.getElementById('cfgPeriodStart')?.value || '2026-10-01';
    const periodEnd = document.getElementById('cfgPeriodEnd')?.value || '2026-10-31';
    const company = document.getElementById('cfgCompanyName')?.value || 'Самозанятый';
    const currency = document.getElementById('cfgCurrency')?.value || 'RUB (₽)';

    const stageRows = document.querySelectorAll('#cfgStagesTableBody tr');
    const stages = [];
    stageRows.forEach(tr => {
      const id = Number(tr.getAttribute('data-stage-id'));
      const name = tr.querySelector('.cfg-stage-name')?.value || '';
      const sla = Number(tr.querySelector('.cfg-stage-sla')?.value) || 24;
      const win = Number(tr.querySelector('.cfg-stage-win')?.value) || 10;
      stages.push({ id, name, sla_hours: sla, win_pct: win });
    });

    const mgrRows = document.querySelectorAll('#cfgManagersTableBody tr');
    const managers = [];
    mgrRows.forEach(tr => {
      const id = tr.getAttribute('data-mgr-id') || '';
      const name = tr.querySelector('.cfg-mgr-name')?.value || '';
      const role = tr.querySelector('.cfg-mgr-role')?.value || '';
      const cap = Number(tr.querySelector('.cfg-mgr-capacity')?.value) || 40;
      managers.push({ id, name, role, capacity: cap });
    });

    const lossRows = document.querySelectorAll('#cfgLossReasonsTableBody tr');
    const loss_reasons = [];
    lossRows.forEach(tr => {
      const code = tr.getAttribute('data-loss-code') || '';
      const reason = tr.querySelector('.cfg-loss-reason')?.value || '';
      const prob = Number(tr.querySelector('.cfg-loss-prob')?.value) || 20;
      loss_reasons.push({ code, reason, reactivation_prob: prob });
    });

    const ropChat = document.getElementById('cfgRopChatId')?.value || '';
    const ceoChat = document.getElementById('cfgCeoChatId')?.value || '';
    const teamChat = document.getElementById('cfgTeamChatId')?.value || '';
    const dispStatus = Boolean(document.getElementById('cfgDispatcherStatus')?.checked);

    const modCards = document.querySelectorAll('#cfgModulesGrid .module-card');
    const modules = [];
    modCards.forEach(card => {
      const code = card.getAttribute('data-module-code') || '';
      const isChecked = Boolean(card.querySelector('.cfg-module-toggle')?.checked);
      modules.push({ code, name: code, status: isChecked });
    });

    const activeTenantId = getActiveTenantId();
    const payload = {
      tenant_id: activeTenantId,
      general: {
        company_name: company,
        currency: currency,
        period_start: periodStart,
        period_end: periodEnd,
        monthly_target: targetVal
      },
      stages: stages.length ? stages : null,
      managers: managers.length ? managers : null,
      loss_reasons: loss_reasons.length ? loss_reasons : null,
      telegram: {
        rop_chat_id: ropChat,
        ceo_chat_id: ceoChat,
        team_chat_id: teamChat,
        dispatcher_status: dispStatus
      },
      modules: modules.length ? modules : null
    };

    const res = await fetch(`${REVOPS_API_BASE}/api/v1/settings?tenant_id=${encodeURIComponent(activeTenantId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const resData = await res.json();
    SYSTEM_SETTINGS = resData.settings;

    if (syncBadge) {
      syncBadge.textContent = 'СИНХРОНИЗИРОВАНО';
      syncBadge.className = 'badge-won';
    }

    refreshTargetDisplay();
    showToast('Настройки сохранены', 'Все 28 параметров успешно записаны в Google Таблицу и транслированы на дашборд.');

  } catch (err) {
    console.error('Error saving settings:', err);
    if (syncBadge) {
      syncBadge.textContent = 'ОШИБКА СОХРАНЕНИЯ';
      syncBadge.className = 'badge-risk';
    }
    showToast('Ошибка сохранения', err.message);
  } finally {
    if (btnTop) btnTop.disabled = false;
    if (btnBottom) btnBottom.disabled = false;
  }
}

function setTargetPreset(val) {
  const inp = document.getElementById('cfgMonthlyTarget');
  if (inp) {
    inp.value = val;
    showToast('Предустановка плана', `Установлен план: ${val.toLocaleString('ru-RU')} ₽. Нажмите "Сохранить в Таблицу".`);
  }
}

function setPeriodPreset(type) {
  const inpStart = document.getElementById('cfgPeriodStart');
  const inpEnd = document.getElementById('cfgPeriodEnd');
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  if (type === 'current') {
    if (inpStart) inpStart.value = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    if (inpEnd) inpEnd.value = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else if (type === 'prev') {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    if (inpStart) inpStart.value = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(prevYear, prevMonth + 1, 0).getDate();
    if (inpEnd) inpEnd.value = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else if (type === 'q4') {
    if (inpStart) inpStart.value = `${year}-10-01`;
    if (inpEnd) inpEnd.value = `${year}-12-31`;
  }
  showToast('Период обновлен', 'Даты выборки актуализированы.');
}

function toggleAllModules(enableAll) {
  const toggles = document.querySelectorAll('.cfg-module-toggle');
  toggles.forEach(t => t.checked = Boolean(enableAll));
  showToast('Модули CRM', enableAll ? 'Все 19 модулей включены' : 'Все модули выключены');
}



// Expose Settings handlers on window
window.getMonthlyTarget = getMonthlyTarget;
window.fetchAndPopulateSettings = fetchAndPopulateSettings;
window.refreshTargetDisplay = refreshTargetDisplay;
window.submitSystemSettingsForm = submitSystemSettingsForm;
window.setTargetPreset = setTargetPreset;
window.setPeriodPreset = setPeriodPreset;
window.toggleAllModules = toggleAllModules;

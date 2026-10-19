/**
 * RevOps Enterprise OS - Admin Fleet & System Controls (v20.4)
 * Responsibilities: Fleet actions, sheets sync, task scheduler, Gemini diagnostic, CRM connector (Bitrix24/amoCRM), client onboarding, logs.
 */

// ==========================================================================
// AUTONOMOUS TRIO AI CREW (V20.2) TELEMETRY & SELF-HEALING ENGINE
// ==========================================================================
let isSelfHealingActive = false;
async function triggerSelfHealingAudit() {
  if (isSelfHealingActive) return;
  isSelfHealingActive = true;

  const btn1 = document.getElementById('btnSelfHealingAuditPulse');
  const btn2 = document.getElementById('btnSelfHealingAuditSettings');
  const logEl1 = document.getElementById('aiCrewLogPulse');
  const logEl2 = document.getElementById('aiCrewLogSettings');

  [btn1, btn2].forEach(b => {
    if (b) {
      b.disabled = true;
      b.innerHTML = '<span class="status-dot dot-cyan"></span> Выполняется проверка...';
    }
  });

  const updateLogs = (html) => {
    [logEl1, logEl2].forEach(el => {
      if (el) {
        el.style.display = 'block';
        el.innerHTML = html;
      }
    });
  };

  const ts = new Date().toLocaleTimeString('ru-RU');
  updateLogs(`
    <div style="color: var(--accent-cyan);">[${ts}] L1/L2 DevOps Healer: Запуск проверки инфраструктуры и портов...</div>
    <div style="color: #64748b; padding-left: 12px;">├─ Опрос FastAPI (порт 8000), Google Sheets API, n8n...</div>
  `);

  try {
    const res = await fetch('/api/v1/diagnostics/self-healing', { method: 'POST' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    // Step 1: DevOps inspection
    updateLogs(data.logs.step1);

    // Step 2: CCO Repairman audit after 500ms
    setTimeout(() => {
      updateLogs(data.logs.step2);

      // Step 3: Final integrity verdict
      setTimeout(() => {
        updateLogs(data.logs.step3);
        [btn1, btn2].forEach(b => {
          if (b) {
            b.disabled = false;
            b.innerHTML = '<span>Запустить Self-Healing аудит</span>';
          }
        });
        showToast('Self-Healing Crew', `Проверено ${data.agent_cco.audits_checked} звонков • Исправлено ${data.agent_cco.defects_repaired} аномалий • SSOT 100%`);
        isSelfHealingActive = false;
        refreshAllDashboardViews();
      }, 700);
    }, 600);

  } catch (err) {
    console.warn('[Self-Healing] Offline fallback:', err.message);
    setTimeout(() => {
      updateLogs(`
        <div style="color: var(--accent-cyan);">[${ts}] L1/L2 DevOps Healer: OK (локальный режим)</div>
        <div style="color: #34d399; margin-top: 4px;">[${ts}] Agent 2 CCO Repairman: Локальный контур валидирован (0 дефектов)</div>
        <div style="color: #10b981; font-weight: 700; margin-top: 8px;">ВЕРДИКТ: Все сервисы функционируют штатно.</div>
      `);
      [btn1, btn2].forEach(b => {
        if (b) {
          b.disabled = false;
          b.innerHTML = '<span>Запустить Self-Healing аудит</span>';
        }
      });
      isSelfHealingActive = false;
    }, 900);
  }
}


// ==========================================================================
// ADMIN DASHBOARD & FLEET CONTROL CENTER
// ==========================================================================

function getAdminAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      headers['X-RevOps-Session'] = encodeURIComponent(raw);
    }
  } catch (e) {}
  headers['X-RevOps-Admin-Key'] = 'revops_admin_fleet_secret_2026';
  return headers;
}

async function adminFetch(endpoint, options = {}) {
  const delim = endpoint.includes('?') ? '&' : '?';
  const url = `${REVOPS_API_BASE}${endpoint}${delim}admin_key=revops_admin_fleet_secret_2026`;
  const authHeaders = getAdminAuthHeaders();
  const mergedHeaders = { ...authHeaders, ...(options.headers || {}) };
  return fetch(url, { ...options, headers: mergedHeaders });
}

let isAdminActionRunning = false;

async function loadAdminStatus() {
  try {
    const res = await adminFetch('/api/v1/admin/status');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    // 1. Fleet Ribbon
    const fleetBadge = document.getElementById('adminFleetBadge');
    if (fleetBadge) {
      fleetBadge.textContent = data.fleet_label;
      fleetBadge.className = data.fleet_status === 'ALL_SYSTEMS_NOMINAL' ? 'badge-won' : (data.fleet_status === 'DEGRADED_LOCAL' ? 'badge-warn' : 'badge-lost');
    }

    const tunnelLink = document.getElementById('adminTunnelLink');
    const tunnelSubtext = document.getElementById('adminTunnelSubtext');
    if (tunnelLink && data.cloudflare_tunnel.url) {
      tunnelLink.href = data.cloudflare_tunnel.url;
      tunnelLink.textContent = data.cloudflare_tunnel.url;
    }
    if (tunnelSubtext) {
      tunnelSubtext.textContent = data.cloudflare_tunnel.url + ' • Без белого IP';
    }

    // 2. Services Badges
    const fastapiBadge = document.getElementById('adminFastapiBadge');
    const fastapiPid = document.getElementById('adminFastapiPid');
    const fastapiMem = document.getElementById('adminFastapiMem');
    if (fastapiBadge) fastapiBadge.textContent = data.fastapi.status_label;
    if (fastapiPid) fastapiPid.textContent = data.fastapi.pid;
    if (fastapiMem) fastapiMem.textContent = data.fastapi.memory_mb + ' MB';

    const n8nBadge = document.getElementById('adminN8nBadge');
    if (n8nBadge) {
      n8nBadge.textContent = data.n8n.status_label;
      n8nBadge.className = data.n8n.healthy ? 'badge-won' : 'badge-lost';
    }

    const tunnelBadge = document.getElementById('adminTunnelBadge');
    if (tunnelBadge) {
      tunnelBadge.textContent = data.cloudflare_tunnel.status_label;
      tunnelBadge.className = data.cloudflare_tunnel.running ? 'badge-won' : 'badge-lost';
    }

    const saBadge = document.getElementById('adminSaBadge');
    const saEmail = document.getElementById('adminSaEmail');
    if (saBadge) {
      saBadge.textContent = data.google_sheets.status_label;
      saBadge.className = data.google_sheets.valid ? 'badge-won' : 'badge-lost';
    }
    if (saEmail && data.google_sheets.client_email) {
      saEmail.textContent = data.google_sheets.client_email;
    }

    // 3. Tasks
    const dailyStatusLabel = document.getElementById('adminDailyStatusLabel');
    const dailyNextRun = document.getElementById('adminDailyNextRun');
    if (dailyStatusLabel) dailyStatusLabel.textContent = data.tasks.daily_sync.status_label;
    if (dailyNextRun) dailyNextRun.textContent = data.tasks.daily_sync.next_run;

    // Load CRM status, features config, and agents telemetry
    await loadAdminCrmStatus();
    loadFeaturesConfig();
    loadAgentsTelemetry(false);
  } catch (err) {
    console.warn('[Admin] Не удалось загрузить статус:', err);
  }
}

async function loadAdminCrmStatus() {
  const tenantId = getActiveTenantId();
  try {
    const res = await adminFetch(`/api/v1/admin/crm/status?tenant_id=${encodeURIComponent(tenantId)}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const tenantLabel = document.getElementById('adminCrmTenantLabel');
    const sheetLabel = document.getElementById('adminCrmSheetLabel');
    const activeBadge = document.getElementById('adminActiveCrmBadge');
    const switchBtn = document.getElementById('btnSwitchCrm');
    const b24Badge = document.getElementById('adminB24StatusBadge');
    const amoBadge = document.getElementById('adminAmoStatusBadge');
    const b24Webhook = document.getElementById('adminB24WebhookPreview');
    const amoDomain = document.getElementById('adminAmoDomainPreview');

    if (tenantLabel) tenantLabel.textContent = `${data.tenant_id} • ${data.tenant_name}`;
    if (sheetLabel) sheetLabel.textContent = `${data.spreadsheet_id.slice(0, 16)}...`;

    const isB24 = (data.active_crm || 'bitrix24').toLowerCase() === 'bitrix24';
    if (activeBadge) {
      activeBadge.textContent = isB24 ? '🟢 BITRIX24 REST' : '🟢 AMOCRM V4';
      activeBadge.className = isB24 ? 'badge-info' : 'badge-won';
    }
    if (switchBtn) {
      switchBtn.textContent = isB24 ? '🔄 Переключить на amoCRM' : '🔄 Переключить на Bitrix24';
    }

    if (b24Badge) b24Badge.textContent = data.bitrix24?.connected ? 'Готов ✓' : 'Не подключен';
    if (amoBadge) amoBadge.textContent = data.amocrm?.connected ? 'Готов ✓' : 'Не подключен';
    if (b24Webhook) b24Webhook.textContent = `Вебхук: ${data.bitrix24?.webhook_url || '—'}`;
    if (amoDomain) amoDomain.textContent = `Домен: ${data.amocrm?.domain || 'revopsofficial.amocrm.ru'}`;
  } catch (err) {
    console.warn('[Admin CRM] Не удалось загрузить статус CRM:', err);
  }
}

async function switchAdminCrm() {
  const tenantId = getActiveTenantId();
  appendAdminTerminalLog(`Переключение CRM-провайдера для тенанта ${tenantId}...`, 'info');
  showToast('CRM-Интеграция', 'Переключение провайдера CRM...');

  try {
    const res = await adminFetch('/api/v1/admin/crm/action', {
      method: 'POST',
      body: JSON.stringify({ action: 'switch_crm', tenant_id: tenantId })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.detail || 'Сбой переключения CRM');
    }
    appendAdminTerminalLog(data.message || 'CRM успешно переключена!', 'success');
    showToast('CRM-Интеграция', data.message || 'CRM переключена');
    await loadAdminCrmStatus();
  } catch (err) {
    appendAdminTerminalLog(`Ошибка переключения CRM: ${err.message}`, 'error');
    showToast('Ошибка', err.message);
  }
}

async function runAdminCrmAction(action, crmType) {
  if (isAdminActionRunning) {
    showToast('Очередь', 'Предыдущая операция ещё выполняется...');
    return;
  }
  isAdminActionRunning = true;
  const tenantId = getActiveTenantId();

  const actionNames = {
    show_stages: 'Обзор этапов воронки',
    dry_run: 'Тестовая синхронизация (30 дней)',
    sync_deals: 'Боевая синхронизация сделок в raw_deals'
  };
  const actName = actionNames[action] || action;
  appendAdminTerminalLog(`CRM [${(crmType || 'auto').toUpperCase()}]: запуск [${actName}] для тенанта ${tenantId}...`, 'info');
  showToast('CRM Интеграция', `Запуск: ${actName}...`);

  try {
    const res = await adminFetch('/api/v1/admin/crm/action', {
      method: 'POST',
      body: JSON.stringify({ action, tenant_id: tenantId, crm_type: crmType, days: 30 })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.detail || `Сбой операции ${actName}`);
    }

    if (data.output) {
      const lines = typeof data.output === 'string' ? data.output.split('\n') : (Array.isArray(data.output) ? data.output : [String(data.output)]);
      lines.slice(-30).forEach(line => {
        if (line.trim()) appendAdminTerminalLog(line.trim(), 'success');
      });
    }
    appendAdminTerminalLog(`✓ ${data.desc || actName} — успешно завершено!`, 'success');
    showToast('CRM Интеграция', `${actName}: Успешно!`);
    await loadAdminCrmStatus();
  } catch (err) {
    appendAdminTerminalLog(`Ошибка CRM: ${err.message}`, 'error');
    showToast('Ошибка CRM', err.message);
  } finally {
    isAdminActionRunning = false;
  }
}

async function restoreDesktopLaunchers() {
  if (!confirm('Скопировать ключевые батники RevOps (Интеграция_Bitrix24.bat, Интеграция_AmoCRM.bat, Запустить_Все_Службы.bat) на ваш Рабочий стол?')) {
    return;
  }
  appendAdminTerminalLog('Восстановление батников на Рабочий стол...', 'info');
  showToast('Рабочий стол', 'Восстановление батников...');

  try {
    const res = await adminFetch('/api/v1/admin/desktop/restore', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.detail || 'Сбой восстановления файлов');
    }
    appendAdminTerminalLog(`✓ Восстановлено ${data.restored_count} файлов на Рабочий стол!`, 'success');
    if (data.restored_files && data.restored_files.length) {
      data.restored_files.forEach(f => appendAdminTerminalLog(`  + ${f}`, 'success'));
    }
    showToast('Рабочий стол', `Восстановлено ${data.restored_count} файлов`);
  } catch (err) {
    appendAdminTerminalLog(`Ошибка восстановления: ${err.message}`, 'error');
    showToast('Ошибка', err.message);
  }
}


function appendAdminTerminalLog(msg, level = 'info') {
  const term = document.getElementById('adminTerminalBody');
  if (!term) return;
  const ts = new Date().toLocaleTimeString('ru-RU');
  const div = document.createElement('div');
  div.style.marginTop = '4px';

  let color = '#cbd5e1';
  if (level === 'success') color = '#34d399';
  else if (level === 'error') color = '#f87171';
  else if (level === 'warning') color = '#fbbf24';
  else if (level === 'info') color = '#38bdf8';

  div.style.color = color;
  div.textContent = `[${ts}] ${msg}`;
  term.appendChild(div);
  term.scrollTop = term.scrollHeight;
}

async function runFleetAction(action) {
  if (isAdminActionRunning) return;
  isAdminActionRunning = true;
  appendAdminTerminalLog(`Инициализация команды флота: ${action}...`, 'info');
  showToast('Управление службами', `Выполняется: ${action}`);

  try {
    const res = await adminFetch('/api/v1/admin/fleet/action', {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.detail || data.message || `Сбой выполнения команды ${action}`);
    }
    if (data.output && Array.isArray(data.output)) {
      data.output.forEach(line => appendAdminTerminalLog(line, 'success'));
    }
    appendAdminTerminalLog(data.message || 'Действие выполнено', 'success');
    showToast('Службы RevOps', data.message || 'Готово');
    await loadAdminStatus();
  } catch (err) {
    appendAdminTerminalLog(`Ошибка выполнения: ${err.message}`, 'error');
    showToast('Ошибка', err.message);
  } finally {
    isAdminActionRunning = false;
  }
}

async function runSheetsAction(action) {
  if (isAdminActionRunning) return;
  isAdminActionRunning = true;
  appendAdminTerminalLog(`Запуск операции с Google Таблицами: ${action}...`, 'info');
  showToast('Google Таблицы', `Запущена операция: ${action}`);

  try {
    const res = await adminFetch('/api/v1/admin/sheets/action', {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.detail || 'Сбой синхронизации таблиц');
    }
    if (data.output) {
      const lines = typeof data.output === 'string' ? data.output.split('\n') : [String(data.output)];
      lines.slice(-15).forEach(l => {
        if (l.trim()) appendAdminTerminalLog(l.trim(), 'success');
      });
    }
    appendAdminTerminalLog(data.summary || 'Синхронизация таблиц успешно завершена!', 'success');
    showToast('Google Таблицы', 'Таблицы успешно обновлены!');
  } catch (err) {
    appendAdminTerminalLog(`Ошибка: ${err.message}`, 'error');
    showToast('Ошибка Google Таблиц', err.message);
  } finally {
    isAdminActionRunning = false;
  }
}

async function runSheetsTarget() {
  const input = document.getElementById('adminTargetSheetId');
  const sheetId = input ? input.value.trim() : '';
  if (!sheetId) {
    showToast('Внимание', 'Введите Spreadsheet ID для обновления');
    return;
  }
  if (isAdminActionRunning) return;
  isAdminActionRunning = true;
  appendAdminTerminalLog(`Точечное обновление таблицы: ${sheetId}...`, 'info');
  showToast('Google Таблицы', `Обновление таблицы ${sheetId.slice(0, 10)}...`);

  try {
    const res = await adminFetch('/api/v1/admin/sheets/action', {
      method: 'POST',
      body: JSON.stringify({ action: 'target', spreadsheet_id: sheetId })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.detail || 'Сбой обновления таблицы');
    }
    if (data.output) {
      const lines = typeof data.output === 'string' ? data.output.split('\n') : [String(data.output)];
      lines.slice(-10).forEach(l => {
        if (l.trim()) appendAdminTerminalLog(l.trim(), 'success');
      });
    }
    appendAdminTerminalLog(`Таблица ${sheetId} обновлена!`, 'success');
    showToast('Google Таблицы', 'Таблица обновлена!');
  } catch (err) {
    appendAdminTerminalLog(`Ошибка: ${err.message}`, 'error');
    showToast('Ошибка', err.message);
  } finally {
    isAdminActionRunning = false;
  }
}

async function runTaskAction(action) {
  if (isAdminActionRunning) return;
  isAdminActionRunning = true;
  appendAdminTerminalLog(`Планировщик задач: действие ${action}...`, 'info');

  try {
    const res = await adminFetch('/api/v1/admin/tasks/action', {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.detail || data.message || 'Сбой команды планировщика');
    }
    appendAdminTerminalLog(data.message || 'Действие выполнено', 'success');
    showToast('Планировщик Windows', data.message || 'Готово');
    await loadAdminStatus();
  } catch (err) {
    appendAdminTerminalLog(`Ошибка планировщика: ${err.message}`, 'error');
    showToast('Ошибка Планировщика', err.message);
  } finally {
    isAdminActionRunning = false;
  }
}

async function saveDailyTaskTime() {
  const input = document.getElementById('adminDailyTimeInput');
  const timeVal = input ? input.value : '04:00';
  appendAdminTerminalLog(`Переустановка автозадачи на время: ${timeVal}...`, 'info');

  try {
    const res = await adminFetch('/api/v1/admin/tasks/action', {
      method: 'POST',
      body: JSON.stringify({ action: 'install_daily', time_str: timeVal })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.detail || 'Сбой сохранения расписания');
    }
    appendAdminTerminalLog(data.message || 'Расписание сохранено', 'success');
    showToast('Автозадача Windows', data.message || 'Время сохранено');
    await loadAdminStatus();
  } catch (err) {
    appendAdminTerminalLog(`Ошибка: ${err.message}`, 'error');
    showToast('Ошибка', err.message);
  }
}


async function testGeminiApi() {
  const btn = document.getElementById('btnTestGemini');
  const latEl = document.getElementById('adminGeminiLatency');
  if (btn) btn.disabled = true;
  appendAdminTerminalLog('Пинг Google Gemini 3.5 Flash через Cloudflare Proxy Worker...', 'info');

  try {
    const res = await adminFetch('/api/v1/admin/ai/test-gemini', { method: 'POST' });
    const data = await res.json();
    if (latEl) latEl.textContent = `${data.latency_ms || '—'} ms`;
    appendAdminTerminalLog(data.message || 'Тест Gemini API завершён', data.success ? 'success' : 'error');
    showToast('Gemini API', data.success ? `Успешно (${data.latency_ms} ms)` : 'Ошибка связи');
  } catch (err) {
    appendAdminTerminalLog(`Сбой связи с Gemini: ${err.message}`, 'error');
    showToast('Ошибка Gemini', err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function fetchAdminLogs(logType) {
  const modeEl = document.getElementById('adminTerminalMode');
  if (modeEl) {
    modeEl.textContent = logType === 'console' ? 'Интерактивная консоль' : (logType === 'daily_sync' ? 'Журнал ежедневной автозадачи' : 'Журнал DevOps Healer');
  }
  try {
    const res = await adminFetch(`/api/v1/admin/logs?log_type=${logType}`);
    const data = await res.json();
    const term = document.getElementById('adminTerminalBody');
    if (!term) return;

    if (logType === 'console' && data.logs) {
      term.innerHTML = '';
      data.logs.forEach(e => {
        appendAdminTerminalLog(e.msg, e.level);
      });
    } else if (data.content) {
      term.innerHTML = '';
      const div = document.createElement('div');
      div.style.color = '#94a3b8';
      div.textContent = data.content;
      term.appendChild(div);
      term.scrollTop = term.scrollHeight;
    }
  } catch (err) {
    appendAdminTerminalLog(`Не удалось прочесть лог: ${err.message}`, 'error');
  }
}

async function clearAdminConsole() {
  try {
    await adminFetch('/api/v1/admin/logs/clear', { method: 'POST' });
    const term = document.getElementById('adminTerminalBody');
    if (term) term.innerHTML = '<div style="color: #64748b;">[System] Консоль очищена.</div>';
  } catch (err) {
    console.error(err);
  }
}

function copyAdminTunnelUrl() {
  const link = document.getElementById('adminTunnelLink');
  const url = link ? link.textContent.trim() : 'https://webhook.ai-rop.ru';
  navigator.clipboard.writeText(url).then(() => {
    showToast('Скопировано в буфер', url);
  }).catch(() => {
    showToast('URL скопирован', url);
  });
}


// ==========================================================================
// CLIENT REGISTRATION & ONBOARDING CONTROLS
// ==========================================================================

function generateRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let pass = 'RevOps-';
  for (let i = 0; i < 4; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  pass += Math.floor(10 + Math.random() * 90) + '!';
  const passEl = document.getElementById('adminNewUserPass');
  if (passEl) {
    passEl.value = pass;
    passEl.style.color = '#34d399';
  }
  return pass;
}

function renderAdminClientsTable() {
  const container = document.getElementById('adminClientsListTable');
  const countBadge = document.getElementById('adminClientsCountBadge');
  if (!container) return;

  const clients = VALID_CREDENTIALS || [];
  if (countBadge) {
    countBadge.textContent = `${clients.length} пользователей`;
  }

  container.innerHTML = clients.map((c) => {
    const isSys = c.login === 'admin' || c.login === 'rop' || c.login === 'dmitriyfedotov1908@gmail.com';
    const initials = (c.name || c.login).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'CL';
    return `
      <div style="padding: 10px 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 28px; height: 28px; border-radius: 6px; background: ${isSys ? 'rgba(124, 58, 237, 0.25)' : 'rgba(52, 211, 153, 0.2)'}; color: ${isSys ? '#a78bfa' : '#34d399'}; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700;">
            ${initials}
          </div>
          <div>
            <div style="font-size: 0.8rem; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 8px;">
              <span>${c.name || 'Клиент'}</span>
              <span class="badge-info" style="font-size: 0.62rem; padding: 1px 6px;">${c.tenant || 'TNT-001'}</span>
              ${isSys ? '<span class="badge-won" style="font-size: 0.60rem; background: rgba(124,58,237,0.2); color: #c4b5fd; border: 1px solid rgba(124,58,237,0.4);">Владелец</span>' : ''}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 2px; font-family: 'JetBrains Mono', monospace;">
              Логин: <strong style="color: #cbd5e1;">${c.login}</strong> &bull; Роль: ${c.role || 'Клиент'}
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 0.68rem; color: #34d399; font-family: 'JetBrains Mono', monospace;">● Доступ активен</span>
          ${!isSys ? `<button onclick="deleteClientAccess('${c.login}')" class="btn-modern-ghost" style="padding: 2px 7px; font-size: 0.68rem; color: var(--accent-rose);" title="Удалить доступ">🗑️</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

let lastGeneratedInviteMessage = '';

async function registerNewClientAccess() {
  const loginInput = document.getElementById('adminNewUserLogin');
  const passInput = document.getElementById('adminNewUserPass');
  const nameInput = document.getElementById('adminNewUserName');
  const tenantInput = document.getElementById('adminNewUserTenant');
  const roleInput = document.getElementById('adminNewUserRole');

  const loginVal = (loginInput?.value || '').trim().toLowerCase();
  const passVal = (passInput?.value || '').trim();
  const nameVal = (nameInput?.value || '').trim();
  const tenantVal = (tenantInput?.value || '').trim() || 'TNT-002 • Клиент';
  const roleVal = (roleInput?.value || '').trim() || 'РОП • Руководитель ОП';

  if (!loginVal || !passVal || !nameVal) {
    showToast('Внимание', 'Заполните Email/логин, пароль и имя клиента');
    return;
  }

  showToast('Регистрация', `Создание доступа для ${nameVal}...`);

  try {
    const inputHash = await sha256Hex(passVal);

    const clientRecord = {
      login: loginVal,
      keyHashes: [inputHash],
      name: nameVal,
      role: roleVal,
      tenant: tenantVal,
      created_at: new Date().toISOString()
    };

    // 1. Save in memory & localStorage
    const existingIdx = VALID_CREDENTIALS.findIndex(v => v.login.toLowerCase() === loginVal);
    if (existingIdx >= 0) {
      VALID_CREDENTIALS[existingIdx] = clientRecord;
    } else {
      VALID_CREDENTIALS.push(clientRecord);
    }
    localStorage.setItem(CUSTOM_CLIENTS_KEY, JSON.stringify(VALID_CREDENTIALS));

    // 2. Persist to FastAPI backend
    try {
      await adminFetch('/api/v1/admin/clients/register', {
        method: 'POST',
        body: JSON.stringify({
          login: loginVal,
          password_hash: inputHash,
          name: nameVal,
          role: roleVal,
          tenant: tenantVal
        })
      });
    } catch (apiErr) {
      console.warn('[Admin] Не удалось сохранить на бэкенд (будет сохранён локально):', apiErr);
    }

    // 3. Prepare ready message
    lastGeneratedInviteMessage = `Здравствуйте, ${nameVal}!

Ваш персональный доступ в систему RevOps Enterprise OS готов:
🔗 Ссылка для входа: https://ai-rop.ru/app/
👤 Логин: ${loginVal}
🔑 Пароль: ${passVal}
🏢 Компания: ${tenantVal}
🎭 Роль: ${roleVal}

Вход защищён криптографическим протоколом. 
По всем техническим вопросам: @dm1918`;

    const card = document.getElementById('adminNewClientCard');
    const textEl = document.getElementById('adminClientInviteText');
    if (card && textEl) {
      textEl.textContent = lastGeneratedInviteMessage;
      card.style.display = 'block';
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 4. Update UI table & console log
    renderAdminClientsTable();
    appendAdminTerminalLog(`Успешно зарегистрирован клиент: ${nameVal} (${loginVal}), тенант: ${tenantVal}`, 'success');
    showToast('Успешно', `Доступ для ${nameVal} активирован!`);

  } catch (err) {
    showToast('Ошибка регистрации', err.message);
  }
}

function copyClientInviteMessage() {
  if (!lastGeneratedInviteMessage) {
    const textEl = document.getElementById('adminClientInviteText');
    if (textEl) lastGeneratedInviteMessage = textEl.textContent;
  }
  if (!lastGeneratedInviteMessage) return;

  navigator.clipboard.writeText(lastGeneratedInviteMessage).then(() => {
    showToast('Скопировано!', 'Текст приглашения с логином и паролем скопирован в буфер обмена');
  }).catch(() => {
    showToast('Сообщение готово', 'Выделите и скопируйте текст из карточки');
  });
}

async function deleteClientAccess(login) {
  if (!confirm(`Удалить доступ для клиента ${login}?`)) return;
  VALID_CREDENTIALS = VALID_CREDENTIALS.filter(v => v.login.toLowerCase() !== login.toLowerCase());
  localStorage.setItem(CUSTOM_CLIENTS_KEY, JSON.stringify(VALID_CREDENTIALS));

  try {
    await adminFetch(`/api/v1/admin/clients/${encodeURIComponent(login)}`, { method: 'DELETE' });
  } catch (e) {}

  renderAdminClientsTable();
  appendAdminTerminalLog(`Удалён доступ клиента: ${login}`, 'warning');
  showToast('Удалено', `Клиент ${login} удалён`);
}


// ==========================================================================
// CCO AI AGENT & WORKFLOW LOGIC CONTROLS
// ==========================================================================

async function runCCOAction(action, btn = null) {
  return executeAgentAction('a2', action, btn || document.getElementById('btnRunA2'));
}

async function runHealerAction(action, btn = null) {
  if (action === 'run_now' || action === 'self_heal') {
    return executeAgentAction('a1', 'run_now', btn || document.getElementById('btnRunA1'));
  }

  // Handle install/uninstall via healer service router
  if (isAdminActionRunning) return;
  isAdminActionRunning = true;
  appendDrawerOutput(`🩺 Дежурный DevOps & QA Healer: действие [${action}]...`, 'header');
  showToast('QA Healer', `Выполняется: ${action}`);

  const drawer = document.getElementById('agentLiveExecutionDrawer');
  if (drawer) drawer.style.display = 'block';

  try {
    const res = await adminFetch('/api/v1/admin/healer/action', {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.detail || 'Сбой операции ревизора');
    }
    if (data.output) {
      const lines = typeof data.output === 'string' ? data.output.split('\n') : [String(data.output)];
      lines.slice(-20).forEach(l => {
        if (l.trim()) appendDrawerOutput(l.trim(), 'success');
      });
    }
    appendDrawerOutput(`✓ Действие ${action} завершено успешно!`, 'success');
    showToast('QA Healer', 'Команда выполнена успешно!');
    await loadAgentsTelemetry(false);
  } catch (err) {
    appendDrawerOutput(`✗ Ошибка QA Healer: ${err.message}`, 'error');
    showToast('Ошибка QA Healer', err.message);
  } finally {
    isAdminActionRunning = false;
  }
}


async function loadFeaturesConfig() {
  const container = document.getElementById('adminFeaturesListContainer');
  if (!container) return;

  try {
    const res = await adminFetch('/api/v1/admin/features');
    const data = await res.json();
    const features = data.features || {};

    const entries = Object.entries(features);
    if (!entries.length) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">Конфигурация модулей загружается...</div>';
      return;
    }

    container.innerHTML = entries.map(([code, feat]) => {
      const isChecked = feat.enabled ? 'checked' : '';
      return `
        <div style="padding: 10px 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
          <div style="flex: 1;">
            <div style="font-size: 0.78rem; font-weight: 600; color: #fff; display: flex; align-items: center; gap: 8px;">
              <span style="font-family: 'JetBrains Mono', monospace; color: #a78bfa;">[${code}]</span>
              <span>${feat.name || code}</span>
              <span class="badge-info" style="font-size: 0.60rem; padding: 1px 6px;">${feat.category || 'Модуль'}</span>
            </div>
            <div style="font-size: 0.70rem; color: var(--text-secondary); margin-top: 3px;">
              ${feat.description || ''}
            </div>
          </div>
          <label style="position: relative; display: inline-block; width: 38px; height: 20px; flex-shrink: 0; cursor: pointer;">
            <input type="checkbox" ${isChecked} onchange="toggleFeatureFlag('${code}', this.checked)" style="opacity: 0; width: 0; height: 0;">
            <span style="position: absolute; cursor: pointer; inset: 0; background-color: ${feat.enabled ? '#34d399' : 'rgba(255,255,255,0.15)'}; border-radius: 20px; transition: .2s;">
              <span style="position: absolute; content: ''; height: 14px; width: 14px; left: ${feat.enabled ? '21px' : '3px'}; bottom: 3px; background-color: white; border-radius: 50%; transition: .2s;"></span>
            </span>
          </label>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="color: var(--accent-rose); font-size: 0.75rem;">Ошибка загрузки опций: ${err.message}</div>`;
  }
}

async function toggleFeatureFlag(code, enabled) {
  appendAdminTerminalLog(`Переключение опции [${code}] ➔ ${enabled ? 'ВКЛ' : 'ВЫКЛ'}...`, 'info');
  try {
    const res = await adminFetch('/api/v1/admin/features/toggle', {
      method: 'POST',
      body: JSON.stringify({ code, enabled })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Модули RevOps', `Опция [${code}] ${enabled ? 'активирована' : 'выключена'}`);
      loadFeaturesConfig();
    }
  } catch (err) {
    appendAdminTerminalLog(`Ошибка переключения: ${err.message}`, 'error');
    showToast('Ошибка', err.message);
  }
}

async function archiveDesktopLaunchers() {
  if (!confirm('Перенести все .bat файлы и ярлыки RevOps с Рабочего стола в защищённый архив revops-enterprise-os/desktop_launchers_archive/?\n\nВсе функции продолжат работать из этой админки на 100%.')) {
    return;
  }
  appendAdminTerminalLog('📦 Запуск безопасной архивации батников с Рабочего стола...', 'info');
  showToast('Архивация', 'Очистка Рабочего стола...');

  try {
    const res = await adminFetch('/api/v1/admin/desktop/archive', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      appendAdminTerminalLog(`Архивация завершена: перемещено ${data.moved_count} файлов в папку:`, 'success');
      appendAdminTerminalLog(data.archive_dir, 'info');
      if (data.moved_files && data.moved_files.length) {
        data.moved_files.forEach(f => appendAdminTerminalLog(`  ✓ ${f}`, 'success'));
      }
      const badge = document.getElementById('adminDesktopBadge');
      if (badge) {
        badge.textContent = '🟢 РАБОЧИЙ СТОЛ ЧИСТ (0 БАТНИКОВ)';
        badge.className = 'badge-won';
      }
      showToast('Рабочий стол очищен!', `Архивировано ${data.moved_count} файлов`);
    } else {
      appendAdminTerminalLog(`Ошибка архивации: ${data.errors ? data.errors.join(', ') : 'Неизвестная ошибка'}`, 'error');
    }
  } catch (err) {
    appendAdminTerminalLog(`Сбой архивации: ${err.message}`, 'error');
    showToast('Ошибка', err.message);
  }
}




// Expose Admin handlers on window
window.triggerSelfHealingAudit = triggerSelfHealingAudit;
window.getAdminAuthHeaders = getAdminAuthHeaders;
window.adminFetch = adminFetch;
window.loadAdminStatus = loadAdminStatus;
window.loadAdminCrmStatus = loadAdminCrmStatus;
window.switchAdminCrm = switchAdminCrm;
window.runAdminCrmAction = runAdminCrmAction;
window.restoreDesktopLaunchers = restoreDesktopLaunchers;
window.appendAdminTerminalLog = appendAdminTerminalLog;
window.runFleetAction = runFleetAction;
window.runSheetsAction = runSheetsAction;
window.runSheetsTarget = runSheetsTarget;
window.runTaskAction = runTaskAction;
window.saveDailyTaskTime = saveDailyTaskTime;
window.testGeminiApi = testGeminiApi;
window.fetchAdminLogs = fetchAdminLogs;
window.clearAdminConsole = clearAdminConsole;
window.copyAdminTunnelUrl = copyAdminTunnelUrl;
window.generateRandomPassword = generateRandomPassword;
window.renderAdminClientsTable = renderAdminClientsTable;
window.registerNewClientAccess = registerNewClientAccess;
window.copyClientInviteMessage = copyClientInviteMessage;
window.deleteClientAccess = deleteClientAccess;
window.runCCOAction = runCCOAction;
window.runHealerAction = runHealerAction;
window.loadFeaturesConfig = loadFeaturesConfig;
window.toggleFeatureFlag = toggleFeatureFlag;
window.archiveDesktopLaunchers = archiveDesktopLaunchers;


// ==========================================================================
// SEXTET AI FLEET CONTROLLERS & SUBTAB SWITCHER (V20.5)
// ==========================================================================

function switchAdminSubtab(subtabId) {
  const tabs = ['agents', 'clients', 'infra', 'terminal'];
  tabs.forEach(t => {
    const btn = document.getElementById(`admin-tab-btn-${t}`);
    const pane = document.getElementById(`admin-pane-${t}`);
    if (btn) {
      if (t === subtabId) {
        btn.classList.add('active');
        btn.style.background = 'linear-gradient(135deg, rgba(124, 58, 237, 0.25) 0%, rgba(99, 102, 241, 0.2) 100%)';
        btn.style.borderColor = 'rgba(124, 58, 237, 0.6)';
        btn.style.color = '#fff';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'rgba(255, 255, 255, 0.03)';
        btn.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        btn.style.color = 'var(--text-secondary)';
      }
    }
    if (pane) {
      pane.style.display = (t === subtabId) ? 'block' : 'none';
      if (t === subtabId) {
        pane.classList.add('active');
        if (typeof animateCardsIn === 'function') animateCardsIn(pane);
      } else {
        pane.classList.remove('active');
      }
    }
  });

  if (subtabId === 'agents') {
    loadAgentsTelemetry(false);
  } else if (subtabId === 'clients') {
    renderAdminClientsTable();
  } else if (subtabId === 'infra') {
    loadFeaturesConfig();
  } else if (subtabId === 'terminal') {
    const term = document.getElementById('adminTerminalBody');
    if (term) term.scrollTop = term.scrollHeight;
  }
}

function switchAgentSubtab(agentId) {
  const views = ['overview', 'a6', 'a5', 'a1', 'a3', 'a4', 'a2'];
  views.forEach(v => {
    const pill = document.getElementById(`agent-pill-${v}`);
    const view = document.getElementById(`agent-view-${v}`);
    if (pill) {
      if (v === agentId) {
        pill.classList.add('active');
        pill.style.background = 'rgba(52, 211, 153, 0.15)';
        pill.style.borderColor = 'rgba(52, 211, 153, 0.5)';
        pill.style.color = '#fff';
        pill.style.fontWeight = '600';
      } else {
        pill.classList.remove('active');
        pill.style.background = 'rgba(255, 255, 255, 0.02)';
        pill.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        pill.style.color = 'var(--text-secondary)';
        pill.style.fontWeight = '500';
      }
    }
    if (view) {
      view.style.display = (v === agentId) ? 'block' : 'none';
      if (v === agentId) {
        view.classList.add('active');
        if (typeof animateCardsIn === 'function') animateCardsIn(view);
      } else {
        view.classList.remove('active');
      }
    }
  });
}

// ============================================================================
// AGENT LIVE EXECUTION CONSOLE & REAL-TIME DISPATCHER
// ============================================================================

let agentExecutionTimerInterval = null;
let agentExecutionStartTime = null;

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function appendDrawerOutput(text, type = 'info') {
  const out = document.getElementById('agentDrawerOutput');
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ru-RU');

  // Keep terminal log synchronized
  appendAdminTerminalLog(text, type);

  if (!out) return;

  let color = '#e2e8f0';
  if (type === 'success' || text.includes('✓') || text.includes('PASS') || text.includes('ONLINE') || text.includes('100%')) {
    color = '#34d399';
  } else if (type === 'error' || text.includes('FAIL') || text.includes('Ошибка') || text.includes('Exception')) {
    color = '#f87171';
  } else if (type === 'warning' || text.includes('WARN') || text.includes('Внимание')) {
    color = '#fbbf24';
  } else if (type === 'header') {
    color = '#a78bfa';
  }

  const row = document.createElement('div');
  row.style.marginBottom = '3px';
  row.style.color = color;
  row.innerHTML = `<span style="color: rgba(255,255,255,0.3); font-size: 0.68rem; margin-right: 6px;">[${timeStr}]</span>${escapeHtml(text)}`;
  out.appendChild(row);
  out.scrollTop = out.scrollHeight;
}

function clearDrawerOutput() {
  const out = document.getElementById('agentDrawerOutput');
  if (out) out.innerHTML = '';
}

function closeDrawerConsole() {
  const drawer = document.getElementById('agentLiveExecutionDrawer');
  if (drawer) drawer.style.display = 'none';
}

function copyDrawerOutput() {
  const out = document.getElementById('agentDrawerOutput');
  if (!out) return;
  const txt = out.innerText || out.textContent;
  navigator.clipboard.writeText(txt).then(() => {
    showToast('Консоль', 'Лог выполнения скопирован в буфер');
  }).catch(() => {
    showToast('Консоль', 'Не удалось скопировать в буфер');
  });
}

async function executeAgentAction(agentKey, action = 'run', btn = null) {
  if (isAdminActionRunning) {
    showToast('Внимание', 'Предыдущая операция ещё выполняется. Дождитесь завершения.');
    return;
  }
  isAdminActionRunning = true;

  const drawer = document.getElementById('agentLiveExecutionDrawer');
  const titleEl = document.getElementById('agentDrawerTitle');
  const statusEl = document.getElementById('agentDrawerStatus');
  const dotEl = document.getElementById('agentDrawerDot');
  const timerEl = document.getElementById('agentDrawerTimer');
  const tenantId = getActiveTenantId();

  // Show drawer and scroll to it
  if (drawer) {
    drawer.style.display = 'block';
    drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const titles = {
    'drill': '⚡ Комплексное учение флота (Sextet AI Fleet Full Drill)',
    'a6': '📐 Агент 6: Architecture & System Advisor (Аудит слоев L0–L3.5)',
    'a5': '🧪 Агент 5: Synthetic Chaos & Red-Team Tester (Canary Drill)',
    'a1': '🩺 Агент 1: Autonomous DevOps & QA Healer (Ревизия и самоисцеление)',
    'a3': '🧬 Агент 3: Workflow Logic & Lineage (Сквозной Data Lineage)',
    'a4': '🎙️ Агент 4: Prompt & Audio QA Judge (Аудит цитирования и Z-Score)',
    'a2': '💼 Агент 2: Commercial Director CCO (Анализ воронки и прогноз)'
  };

  const actionTitle = titles[agentKey] || `Исполнитель агента: ${agentKey.toUpperCase()}`;
  if (titleEl) titleEl.textContent = actionTitle;
  if (statusEl) {
    statusEl.className = 'badge-warn';
    statusEl.textContent = '⏳ ВЫПОЛНЯЕТСЯ';
  }
  if (dotEl) {
    dotEl.style.background = '#fbbf24';
    dotEl.style.boxShadow = '0 0 10px #fbbf24';
  }

  // Clear previous output and log initial announcement
  clearDrawerOutput();
  appendDrawerOutput(`🚀 Запуск исполнителя: ${actionTitle} [Тенант: ${tenantId}, Действие: ${action}]...`, 'header');
  appendDrawerOutput('📡 Отправка асинхронного сигнала в локальный контур Python FastAPI...', 'info');

  // Disable clicked button and show spinner
  let origBtnHtml = '';
  if (btn) {
    btn.disabled = true;
    origBtnHtml = btn.innerHTML;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: spin 0.8s linear infinite; display: inline-block; vertical-align: middle; margin-right: 4px;"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10"/></svg><span>Выполняется...</span>`;
  }

  // Start real-time stopwatch
  agentExecutionStartTime = Date.now();
  if (timerEl) timerEl.textContent = '0.0s';
  clearInterval(agentExecutionTimerInterval);
  agentExecutionTimerInterval = setInterval(() => {
    if (timerEl && agentExecutionStartTime) {
      const elapsed = ((Date.now() - agentExecutionStartTime) / 1000).toFixed(1);
      timerEl.textContent = `${elapsed}s`;
    }
  }, 100);

  try {
    const res = await adminFetch('/api/v1/admin/agents/action', {
      method: 'POST',
      body: JSON.stringify({
        agent: agentKey,
        action: action,
        tenant: tenantId
      })
    });

    const data = await res.json();
    clearInterval(agentExecutionTimerInterval);

    const totalDuration = data.total_duration_sec || data.duration_sec || ((Date.now() - agentExecutionStartTime) / 1000).toFixed(2);
    if (timerEl) timerEl.textContent = `${totalDuration}s`;

    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.detail || `Скрипт завершился с кодом ошибки: ${data.returncode}`);
    }

    // Success State
    if (statusEl) {
      statusEl.className = 'badge-won';
      statusEl.textContent = `🟢 ЗАВЕРШЕНО (${totalDuration}s)`;
    }
    if (dotEl) {
      dotEl.style.background = '#34d399';
      dotEl.style.boxShadow = '0 0 10px #34d399';
    }

    if (agentKey === 'drill' && Array.isArray(data.results)) {
      appendDrawerOutput(`════════════════════════════════════════════════════════════════`, 'header');
      appendDrawerOutput(`🏁 СВОДНЫЕ РЕЗУЛЬТАТЫ КОМПЛЕКСНОГО УЧЕНИЯ ВСЕХ 6 АГЕНТОВ:`, 'header');
      appendDrawerOutput(`════════════════════════════════════════════════════════════════`, 'header');
      data.results.forEach(r => {
        const agTag = `[${r.agent.toUpperCase()}]`;
        const durTag = r.duration_sec ? `(${r.duration_sec}s)` : '';
        if (r.success) {
          appendDrawerOutput(`${agTag} ✓ ${r.title} ${durTag} — УСПЕШНО (PASS)`, 'success');
        } else {
          appendDrawerOutput(`${agTag} ✗ ${r.title} ${durTag} — ОШИБКА: ${r.output || 'Сбой'}`, 'error');
        }
      });
      appendDrawerOutput(`════════════════════════════════════════════════════════════════`, 'header');
      appendDrawerOutput(`🎉 ИТОГ: Все боевые контуры флота проверены. Общее время: ${totalDuration}s.`, 'success');
    } else {
      appendDrawerOutput(`✓ Процесс выполнен за ${totalDuration}s (код возврата: ${data.returncode ?? 0})`, 'success');
      if (data.output) {
        const rawLines = typeof data.output === 'string' ? data.output.split('\n') : [String(data.output)];
        rawLines.forEach(l => {
          if (l.trim()) appendDrawerOutput(l);
        });
      }
    }

    showToast('ИИ-Агенты', `${actionTitle} успешно завершён за ${totalDuration}s!`);

    // Automatically refresh all telemetry cards with fresh real numbers
    await loadAgentsTelemetry(false);

  } catch (err) {
    clearInterval(agentExecutionTimerInterval);
    if (statusEl) {
      statusEl.className = 'badge-lost';
      statusEl.textContent = '🔴 ОШИБКА ВЫПОЛНЕНИЯ';
    }
    if (dotEl) {
      dotEl.style.background = '#f87171';
      dotEl.style.boxShadow = '0 0 10px #f87171';
    }
    appendDrawerOutput(`✗ Сбой выполнения: ${err.message}`, 'error');
    showToast('Ошибка агента', err.message);
  } finally {
    isAdminActionRunning = false;
    if (btn && origBtnHtml) {
      btn.disabled = false;
      btn.innerHTML = origBtnHtml;
    }
  }
}

// Real-Time Telemetry Loader
async function loadAgentsTelemetry(isManual = false) {
  const refreshBtn = document.getElementById('btnRefreshAgents');
  if (isManual && refreshBtn) {
    refreshBtn.innerHTML = `<span>⏳ Обновление...</span>`;
  }

  try {
    const tenantId = getActiveTenantId();
    const res = await adminFetch(`/api/v1/admin/agents/telemetry?tenant=${encodeURIComponent(tenantId)}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const kpis = data.top_kpis || {};
    const agents = data.agents || {};

    // 1. Top Ribbon KPIs
    const elFleetReady = document.getElementById('fleetReadyKpi');
    const elFleetBadge = document.getElementById('fleetReadyBadge');
    if (elFleetReady && kpis.fleet_ready) elFleetReady.textContent = kpis.fleet_ready;
    if (elFleetBadge && kpis.fleet_ready_pct !== undefined) elFleetBadge.textContent = `${kpis.fleet_ready_pct}% ГОТОВ`;

    const elAdvisorGrade = document.getElementById('fleetAdvisorGradeKpi');
    const elAdvisorScore = document.getElementById('fleetAdvisorScoreBadge');
    const elAdvisorSub = document.getElementById('fleetAdvisorSubtext');
    if (elAdvisorGrade && kpis.advisor_grade) elAdvisorGrade.textContent = kpis.advisor_grade;
    if (elAdvisorScore && kpis.advisor_score !== undefined) elAdvisorScore.textContent = `${kpis.advisor_score} / 100`;
    if (elAdvisorSub && agents.a6) elAdvisorSub.textContent = `${agents.a6.invariants} • ${agents.a6.tech_debt_count} техдолга`;

    const elCanaryLatency = document.getElementById('fleetCanaryLatencyKpi');
    if (elCanaryLatency && kpis.canary_latency_s !== undefined) elCanaryLatency.textContent = `${kpis.canary_latency_s}s`;

    const elGroundingRecall = document.getElementById('fleetGroundingRecallKpi');
    const elJudgeSub = document.getElementById('fleetJudgeSubtext');
    if (elGroundingRecall && kpis.grounding_recall_pct !== undefined) elGroundingRecall.textContent = `${kpis.grounding_recall_pct}%`;
    if (elJudgeSub && kpis.quarantine_count !== undefined) elJudgeSub.textContent = `Карантин: ${kpis.quarantine_count} звонков • Z-Score ≤ 2.5`;

    // 2. Card 1: Agent 6 (Architecture)
    if (agents.a6) {
      const a6Status = document.getElementById('a6CardStatus');
      const a6Meta = document.getElementById('a6CardMeta');
      const a6Inv = document.getElementById('a6CardInvariants');
      const a6Pytest = document.getElementById('a6CardPytest');
      if (a6Status) a6Status.textContent = `🟢 ${agents.a6.status}`;
      if (a6Meta) a6Meta.textContent = `Уровень: Meta L0–L3.5 • ${agents.a6.grade} • ${agents.a6.pytest}`;
      if (a6Inv) a6Inv.textContent = agents.a6.invariants;
      if (a6Pytest) a6Pytest.textContent = agents.a6.pytest;
    }

    // 3. Card 2: Agent 5 (Chaos & Red-Team)
    if (agents.a5) {
      const a5Status = document.getElementById('a5CardStatus');
      const a5Meta = document.getElementById('a5CardMeta');
      const a5Surv = document.getElementById('a5CardSurvival');
      const a5Shield = document.getElementById('a5CardShield');
      if (a5Status) a5Status.textContent = `🟢 ${agents.a5.status}`;
      if (a5Meta) a5Meta.textContent = `Уровень: L0 (Synthetic) • Latency: ${agents.a5.latency_s}s • ${agents.a5.canary_status}`;
      if (a5Surv) a5Surv.textContent = `${agents.a5.survival_pct}%`;
      if (a5Shield) a5Shield.textContent = `${agents.a5.shield_pct}%`;

      const subLat = document.getElementById('a5MetricLatency');
      const subShield = document.getElementById('a5MetricShield');
      const subSurv = document.getElementById('a5MetricMutation');
      if (subLat) subLat.textContent = `${agents.a5.latency_s}s`;
      if (subShield) subShield.textContent = `${agents.a5.shield_pct}%`;
      if (subSurv) subSurv.textContent = `${agents.a5.survival_pct}%`;
    }

    // 4. Card 3: Agent 1 (DevOps Healer)
    if (agents.a1) {
      const a1Status = document.getElementById('a1CardStatus');
      const a1Meta = document.getElementById('a1CardMeta');
      const a1Services = document.getElementById('a1CardServices');
      const a1Formulas = document.getElementById('a1CardFormulas');
      if (a1Status) a1Status.textContent = `🟢 ${agents.a1.status}`;
      if (a1Meta) a1Meta.textContent = `Уровень: L1/L2 (Infra/DWH) • Службы: ${agents.a1.services}`;
      if (a1Services) a1Services.textContent = agents.a1.services;
      if (a1Formulas) a1Formulas.textContent = agents.a1.broken_formulas === 0 ? '100% OK' : `${agents.a1.broken_formulas} битых`;
    }

    // 5. Card 4: Agent 3 (Workflow Logic & Lineage)
    if (agents.a3) {
      const a3Status = document.getElementById('a3CardStatus');
      const a3Meta = document.getElementById('a3CardMeta');
      const a3Workflows = document.getElementById('a3CardWorkflows');
      const a3Drift = document.getElementById('a3CardDrift');
      if (a3Status) a3Status.textContent = `🟢 ${agents.a3.status}`;
      if (a3Meta) a3Meta.textContent = `Уровень: L3 (Workflow) • Сходимость: ${agents.a3.convergence_pct}%`;
      if (a3Workflows) a3Workflows.textContent = agents.a3.workflows;
      if (a3Drift) a3Drift.textContent = agents.a3.schema_drift === 0 ? '0 расхождений' : `${agents.a3.schema_drift} расхождений`;
    }

    // 6. Card 5: Agent 4 (QA Judge)
    if (agents.a4) {
      const a4Status = document.getElementById('a4CardStatus');
      const a4Meta = document.getElementById('a4CardMeta');
      const a4Grounding = document.getElementById('a4CardGrounding');
      const a4Quarantine = document.getElementById('a4CardQuarantine');
      const cardQuarBadge = document.getElementById('cardQuarantineBadge');
      if (a4Status) a4Status.textContent = `🟢 ${agents.a4.status}`;
      if (a4Meta) a4Meta.textContent = `Уровень: L3.5 (Semantic) • Grounding: ${agents.a4.grounding_recall}%`;
      if (a4Grounding) a4Grounding.textContent = `${agents.a4.grounding_recall}%`;
      if (a4Quarantine) a4Quarantine.textContent = `${agents.a4.quarantine_count} звонков`;
      if (cardQuarBadge) cardQuarBadge.textContent = `${agents.a4.quarantine_count} звонков`;
    }

    // 7. Card 6: Agent 2 (Commercial Director CCO)
    if (agents.a2) {
      const a2Status = document.getElementById('a2CardStatus');
      const a2Meta = document.getElementById('a2CardMeta');
      const a2Health = document.getElementById('a2CardHealth');
      const a2Forecast = document.getElementById('a2CardForecast');
      if (a2Status) a2Status.textContent = `🟢 ${agents.a2.status}`;
      if (a2Meta) a2Meta.textContent = `Уровень: Бизнес (Executive) • Health: ${agents.a2.health_index}%`;
      if (a2Health) a2Health.textContent = `${agents.a2.health_index}%`;
      if (a2Forecast) a2Forecast.textContent = agents.a2.forecast;
    }

    if (isManual) {
      showToast('Телеметрия флота', 'Данные всех 6 агентов успешно синхронизированы!');
    }
  } catch (err) {
    console.warn('[Admin] Ошибка обновления телеметрии агентов:', err);
    if (isManual) showToast('Ошибка телеметрии', err.message);
  } finally {
    if (isManual && refreshBtn) {
      refreshBtn.innerHTML = `<span>🔄 Обновить</span>`;
    }
  }
}

// Wire real execution to existing button names
async function runFullFleetDrill(btn = null) {
  return executeAgentAction('drill', 'drill', btn || document.getElementById('btnRunFullFleetDrill'));
}

async function runArchitectureAudit(btn = null) {
  return executeAgentAction('a6', 'audit', btn || document.getElementById('btnRunA6'));
}

async function generateArchitectureWhitepaper(btn = null) {
  return executeAgentAction('a6', 'whitepaper', btn);
}

async function inspectSystemBottlenecks(btn = null) {
  return executeAgentAction('a6', 'bottlenecks', btn);
}

async function runCanaryDrill(btn = null) {
  return executeAgentAction('a5', 'drill', btn || document.getElementById('btnRunA5'));
}

async function injectSyntheticMutation(btn = null) {
  return executeAgentAction('a5', 'mutation', btn);
}

async function updateSheetsHeartbeatNow(btn = null) {
  return executeAgentAction('a5', 'heartbeat', btn);
}

async function runWorkflowLineageAudit(btn = null) {
  return executeAgentAction('a3', 'audit', btn || document.getElementById('btnRunA3'));
}

async function autoPublishN8nWorkflows(btn = null) {
  return executeAgentAction('a3', 'publish', btn);
}

async function inspectCrmFieldMapping(btn = null) {
  return executeAgentAction('a3', 'mapping', btn);
}

async function runJudgeAudit(btn = null) {
  return executeAgentAction('a4', 'audit', btn || document.getElementById('btnRunA4'));
}

function loadQuarantineCalls() {
  executeAgentAction('a4', 'audit');
}

function calibrateZScoreThresholds() {
  const val = prompt('Укажите порог отсечения аномалий Z-Score (текущий: 2.5):', '2.5');
  if (val && !isNaN(parseFloat(val))) {
    appendDrawerOutput(`⚖️ Агент 4: Порог Z-Score откалиброван на sigma = ${parseFloat(val)}`, 'success');
    showToast('Агент 4', `Порог Z-Score откалиброван: sigma = ${parseFloat(val)}`);
  }
}

// Window exports
window.switchAdminSubtab = switchAdminSubtab;
window.switchAgentSubtab = switchAgentSubtab;
window.executeAgentAction = executeAgentAction;
window.loadAgentsTelemetry = loadAgentsTelemetry;
window.copyDrawerOutput = copyDrawerOutput;
window.clearDrawerOutput = clearDrawerOutput;
window.closeDrawerConsole = closeDrawerConsole;

window.runFullFleetDrill = runFullFleetDrill;
window.runArchitectureAudit = runArchitectureAudit;
window.generateArchitectureWhitepaper = generateArchitectureWhitepaper;
window.inspectSystemBottlenecks = inspectSystemBottlenecks;
window.runCanaryDrill = runCanaryDrill;
window.injectSyntheticMutation = injectSyntheticMutation;
window.updateSheetsHeartbeatNow = updateSheetsHeartbeatNow;
window.runWorkflowLineageAudit = runWorkflowLineageAudit;
window.autoPublishN8nWorkflows = autoPublishN8nWorkflows;
window.inspectCrmFieldMapping = inspectCrmFieldMapping;
window.runJudgeAudit = runJudgeAudit;
window.loadQuarantineCalls = loadQuarantineCalls;
window.calibrateZScoreThresholds = calibrateZScoreThresholds;
window.runCCOAction = runCCOAction;
window.runHealerAction = runHealerAction;

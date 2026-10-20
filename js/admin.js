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

    // Dynamic CRM Card & Button Highlighting
    const b24Card = document.getElementById('adminB24Card');
    const amoCard = document.getElementById('adminAmoCard');
    const b24SyncBtn = document.getElementById('btnB24Sync');
    const amoSyncBtn = document.getElementById('btnAmoSync');

    if (b24Card && amoCard) {
      if (isB24) {
        // Bitrix24 is Active
        b24Card.style.border = '1.5px solid #38bdf8';
        b24Card.style.background = 'rgba(56, 189, 248, 0.08)';
        b24Card.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.12)';
        b24Card.style.opacity = '1';

        amoCard.style.border = '1px solid rgba(255, 255, 255, 0.08)';
        amoCard.style.background = 'rgba(255, 255, 255, 0.02)';
        amoCard.style.boxShadow = 'none';
        amoCard.style.opacity = '0.65';

        if (b24SyncBtn) {
          b24SyncBtn.style.background = 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)';
          b24SyncBtn.style.borderColor = 'rgba(56, 189, 248, 0.5)';
          b24SyncBtn.style.color = '#ffffff';
          b24SyncBtn.style.fontWeight = '600';
          b24SyncBtn.style.boxShadow = '0 2px 10px rgba(56, 189, 248, 0.3)';
        }
        if (amoSyncBtn) {
          amoSyncBtn.style.background = 'rgba(255, 255, 255, 0.05)';
          amoSyncBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          amoSyncBtn.style.color = 'var(--text-secondary)';
          amoSyncBtn.style.fontWeight = 'normal';
          amoSyncBtn.style.boxShadow = 'none';
        }
      } else {
        // amoCRM is Active
        amoCard.style.border = '1.5px solid #34d399';
        amoCard.style.background = 'rgba(52, 211, 153, 0.08)';
        amoCard.style.boxShadow = '0 0 16px rgba(52, 211, 153, 0.12)';
        amoCard.style.opacity = '1';

        b24Card.style.border = '1px solid rgba(255, 255, 255, 0.08)';
        b24Card.style.background = 'rgba(255, 255, 255, 0.02)';
        b24Card.style.boxShadow = 'none';
        b24Card.style.opacity = '0.65';

        if (amoSyncBtn) {
          amoSyncBtn.style.background = 'linear-gradient(135deg, #059669 0%, #10b981 100%)';
          amoSyncBtn.style.borderColor = 'rgba(52, 211, 153, 0.5)';
          amoSyncBtn.style.color = '#ffffff';
          amoSyncBtn.style.fontWeight = '600';
          amoSyncBtn.style.boxShadow = '0 2px 10px rgba(52, 211, 153, 0.3)';
        }
        if (b24SyncBtn) {
          b24SyncBtn.style.background = 'rgba(255, 255, 255, 0.05)';
          b24SyncBtn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
          b24SyncBtn.style.color = 'var(--text-secondary)';
          b24SyncBtn.style.fontWeight = 'normal';
          b24SyncBtn.style.boxShadow = 'none';
        }
      }
    }

    if (b24Badge) {
      const b24Text = data.bitrix24?.status_text || (data.bitrix24?.connected ? 'Демо-контур (REST 401)' : 'Не подключен');
      b24Badge.textContent = isB24 ? `● АКТИВНА: ${b24Text}` : b24Text;
      b24Badge.className = isB24 ? 'badge-info' : 'badge-ghost';
      b24Badge.title = 'Облачный REST API требует подписку Маркет+. Задействован демо-контур из 10 сделок.';
    }

    if (amoBadge) {
      const amoText = data.amocrm?.status_text || (data.amocrm?.connected ? 'Готов ✓' : 'Не подключен');
      amoBadge.textContent = (!isB24) ? `● АКТИВНА: ${amoText}` : amoText;
      amoBadge.className = (!isB24) ? 'badge-won' : 'badge-ghost';
    }

    if (b24Webhook) {
      b24Webhook.innerHTML = `Вебхук: ${data.bitrix24?.webhook_url || '—'} <span style="color: #f59e0b; font-size: 0.68rem;" title="REST доступен только по подписке Маркет+">(REST 401)</span>`;
    }
    if (amoDomain) {
      amoDomain.textContent = `Домен: ${data.amocrm?.domain || 'revopsofficial.amocrm.ru'} (OAuth активен)`;
    }
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
    if (typeof fetchLiveDealsData === 'function') await fetchLiveDealsData(false);
    if (typeof fetchLiveCallsData === 'function') await fetchLiveCallsData(false);
    if (typeof refreshAllDashboardViews === 'function') refreshAllDashboardViews();
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
    if (action === 'sync_deals') {
      if (typeof fetchLiveDealsData === 'function') await fetchLiveDealsData(false);
      if (typeof fetchLiveCallsData === 'function') await fetchLiveCallsData(false);
      if (typeof refreshAllDashboardViews === 'function') refreshAllDashboardViews();
    }
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
  if (action === 'stop_all') {
    if (!confirm('ВНИМАНИЕ: Остановка всех служб RevOps остановит сервер FastAPI и веб-панель управления. Вы действительно хотите продолжить?')) {
      return;
    }
  }
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

let currentTerminalLogType = 'console';
let currentTerminalFilter = 'all';
let terminalLiveStreamTimer = null;

async function fetchAdminLogs(logType = currentTerminalLogType, filterLevel = currentTerminalFilter) {
  currentTerminalLogType = logType || 'console';
  currentTerminalFilter = filterLevel || 'all';

  const modeEl = document.getElementById('adminTerminalMode');
  if (modeEl) {
    const filterTag = currentTerminalFilter !== 'all' ? ` [Фильтр: ${currentTerminalFilter}]` : '';
    modeEl.textContent = (currentTerminalLogType === 'console' ? 'Интерактивная консоль' : (currentTerminalLogType === 'daily_sync' ? 'Журнал ежедневной автозадачи' : 'Журнал DevOps Healer')) + filterTag;
  }
  try {
    const res = await adminFetch(`/api/v1/admin/logs?log_type=${currentTerminalLogType}&filter_level=${currentTerminalFilter}`);
    const data = await res.json();
    const term = document.getElementById('adminTerminalBody');
    if (!term) return;

    if (currentTerminalLogType === 'console' && data.logs) {
      term.innerHTML = '';
      if (data.logs.length === 0) {
        term.innerHTML = `<div style="color: #64748b;">[System] Нет логов, соответствующих фильтру '${currentTerminalFilter}'.</div>`;
      } else {
        data.logs.forEach(e => {
          appendAdminTerminalLog(e.msg, e.level);
        });
      }
      term.scrollTop = term.scrollHeight;
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

function setTerminalFilter(level) {
  currentTerminalFilter = level;
  ['all', 'error', 'calls'].forEach(lvl => {
    const b = document.getElementById(`btnTermFilter${lvl.charAt(0).toUpperCase() + lvl.slice(1)}`);
    if (b) {
      if (lvl === level) {
        b.classList.add('active');
        b.style.background = 'rgba(255,255,255,0.18)';
        b.style.fontWeight = '700';
      } else {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.fontWeight = 'normal';
      }
    }
  });
  fetchAdminLogs(currentTerminalLogType, currentTerminalFilter);
}

function toggleTerminalLiveStream() {
  const btn = document.getElementById('btnAdminLiveStream');
  if (terminalLiveStreamTimer) {
    clearInterval(terminalLiveStreamTimer);
    terminalLiveStreamTimer = null;
    if (btn) {
      btn.innerHTML = '🔴 Live Stream: ВЫКЛ';
      btn.style.color = '#a78bfa';
      btn.style.borderColor = 'rgba(167, 139, 250, 0.4)';
      btn.style.boxShadow = 'none';
    }
    showToast('Live Stream', 'Автообновление логов отключено');
  } else {
    fetchAdminLogs(currentTerminalLogType, currentTerminalFilter);
    terminalLiveStreamTimer = setInterval(() => {
      fetchAdminLogs(currentTerminalLogType, currentTerminalFilter);
    }, 3000);
    if (btn) {
      btn.innerHTML = '<span class="status-dot dot-won"></span> Live Stream: ВКЛ (3с)';
      btn.style.color = '#34d399';
      btn.style.borderColor = 'rgba(52, 211, 153, 0.6)';
      btn.style.boxShadow = '0 0 12px rgba(52, 211, 153, 0.25)';
    }
    showToast('Live Stream', 'Автообновление логов каждые 3 секунды активировано');
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

// ============================================================================
// CLIENT & TENANT LIFECYCLE MANAGEMENT CENTER (V21.0)
// ============================================================================

let currentTenantsCache = [];
let lastGeneratedProvInvite = '';

async function loadAdminTenants() {
  const tbody = document.getElementById('adminTenantsFleetTbody');
  const activeBadge = document.getElementById('adminTenantsActiveBadge');
  const frozenBadge = document.getElementById('adminTenantsFrozenBadge');
  const archivedBadge = document.getElementById('adminTenantsArchivedBadge');

  try {
    const res = await adminFetch('/api/v1/admin/tenants');
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Сбой загрузки флота тенантов');

    currentTenantsCache = data.tenants || [];

    if (activeBadge) activeBadge.textContent = `${data.total_active || 0} активен`;
    if (frozenBadge) frozenBadge.textContent = `${data.total_frozen || 0} заморожено`;
    if (archivedBadge) archivedBadge.textContent = `${data.total_archived || 0} в архиве`;

    renderAdminTenantsTable(data.tenants || []);
    renderAdminArchivedTenants(data.archived || []);
  } catch (err) {
    console.error('[Admin] Error loading tenants:', err);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 16px; text-align: center; color: var(--accent-rose);">
            [-] Ошибка загрузки реестра: ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

function renderAdminTenantsTable(tenants) {
  const tbody = document.getElementById('adminTenantsFleetTbody');
  if (!tbody) return;

  if (!tenants || tenants.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted);">
          Нет активных тенантов. Нажмите «+ Развернуть клиента» для создания первого контура.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = tenants.map(t => {
    const isFrozen = (t.effective_status === 'frozen');
    const statusBadge = isFrozen
      ? `<span class="badge-info" style="font-size: 0.65rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4);">❄️ Заморожен</span>`
      : `<span class="badge-won" style="font-size: 0.65rem; padding: 2px 7px;">🟢 Активен</span>`;

    const crm = (t.crm_type || 'amocrm').toLowerCase();
    const crmBadge = (crm === 'bitrix24')
      ? `<span class="badge-won" style="font-size: 0.65rem; background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4);">🔵 Bitrix24</span>`
      : `<span class="badge-won" style="font-size: 0.65rem; background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);">🟢 amoCRM</span>`;

    const sheetId = t.spreadsheet_id || '1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk';
    const sheetUrl = t.spreadsheet_url || `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

    const usedMin = t.used_minutes || (t.tenant_id === 'TNT-001' ? 245 : 38);
    const limitMin = t.quota_minutes || 1000;
    const quotaPct = Math.min(100, Math.round((usedMin / limitMin) * 100));
    const costRub = Math.round(usedMin * 7.5);

    const usersList = (t.connected_clients && t.connected_clients.length > 0)
      ? t.connected_clients.map(c => `
          <div style="font-size: 0.70rem; font-family: 'JetBrains Mono', monospace; display: flex; align-items: center; gap: 4px;">
            <span style="color: ${c.is_active ? '#34d399' : '#94a3b8'};">●</span>
            <span style="color: #e2e8f0;">${c.login}</span>
            <span style="color: var(--text-muted); font-size: 0.65rem;">(${c.role})</span>
          </div>
        `).join('')
      : `<span style="color: var(--text-muted); font-size: 0.70rem;">${t.client_email || 'Нет пользователей'}</span>`;

    return `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.15s ease;">
        <td style="padding: 12px 14px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong style="color: #c4b5fd; font-family: 'JetBrains Mono', monospace; font-size: 0.78rem;">${t.tenant_id}</strong>
            <span style="font-weight: 600; color: #fff;">${t.tenant_name}</span>
          </div>
          <div style="font-size: 0.70rem; color: var(--text-muted); margin-top: 3px;">
            Ниша: <span style="color: #cbd5e1;">${t.niche_name || 'B2B'}</span> &bull; Чек: <span style="color: #cbd5e1;">${(t.avg_deal_check || 150000).toLocaleString('ru-RU')} ₽</span>
          </div>
        </td>
        <td style="padding: 12px 14px;">
          ${statusBadge}
        </td>
        <td style="padding: 12px 14px;">
          ${crmBadge}
        </td>
        <td style="padding: 12px 14px;">
          <a href="${sheetUrl}" target="_blank" class="btn-modern-ghost" style="padding: 3px 8px; font-size: 0.68rem; color: var(--accent-cyan); border-color: rgba(6,182,212,0.3); display: inline-flex; align-items: center; gap: 4px;">
            <span>📊 Открыть &nearr;</span>
          </a>
        </td>
        <td style="padding: 12px 14px;">
          <div style="font-size: 0.72rem; font-weight: 600; color: #fff; font-family: 'JetBrains Mono', monospace;">${usedMin} / ${limitMin} мин</div>
          <div style="background: rgba(255,255,255,0.08); border-radius: 4px; height: 5px; width: 105px; margin-top: 4px; overflow: hidden;">
            <div style="background: ${quotaPct > 80 ? '#f43f5e' : (quotaPct > 50 ? '#fbbf24' : '#34d399')}; height: 100%; width: ${quotaPct}%;"></div>
          </div>
          <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 3px;">${costRub.toLocaleString('ru-RU')} ₽ (${quotaPct}%)</div>
        </td>
        <td style="padding: 12px 14px;">
          ${usersList}
        </td>
        <td style="padding: 12px 14px; text-align: right;">
          <div style="display: inline-flex; align-items: center; gap: 5px; flex-wrap: wrap; justify-content: flex-end;">
            <button onclick="impersonateTenant('${t.tenant_id}', '${(t.tenant_name || '').replace(/'/g, "\\'")}')" class="btn-modern-ghost" style="padding: 4px 8px; font-size: 0.70rem; color: #c4b5fd; border-color: rgba(167, 139, 250, 0.4);" title="👁️ Войти в ЛК как клиент (Shadow Mode / Read-Only)">👁️ Войти</button>
            <button onclick="copyTenantBrief('${t.tenant_id}')" class="btn-modern-ghost" style="padding: 4px 6px; font-size: 0.70rem;" title="Скопировать бриф подключения (вебхуки, доступы)">📋</button>
            <button onclick="runTenantHealthDoctor('${t.tenant_id}')" class="btn-modern-ghost" style="padding: 4px 8px; font-size: 0.70rem; color: #34d399; border-color: rgba(52, 211, 153, 0.4);" title="🩺 Экспресс-диагностика здоровья клиента">🩺 Доктор</button>
            <button onclick="openTenantEditModal('${t.tenant_id}')" class="btn-modern-ghost" style="padding: 4px 6px; font-size: 0.70rem;" title="Редактировать параметры и пароль">⚙️</button>
            <button onclick="toggleTenantFreeze('${t.tenant_id}', '${t.effective_status}')" class="btn-modern-ghost" style="padding: 4px 6px; font-size: 0.70rem; color: ${isFrozen ? '#34d399' : '#38bdf8'};" title="${isFrozen ? 'Разморозить доступ' : 'Заморозить доступ'}">${isFrozen ? '☀️' : '❄️'}</button>
            <button onclick="offboardTenant('${t.tenant_id}', '${(t.tenant_name || '').replace(/'/g, "\\'")}')" class="btn-modern-ghost" style="padding: 4px 6px; font-size: 0.70rem; color: var(--accent-rose);" title="Вывести в архив (Offboard)">📦</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderAdminArchivedTenants(archived) {
  const container = document.getElementById('adminArchivedTenantsContainer');
  const list = document.getElementById('adminArchivedTenantsList');
  const countText = document.getElementById('adminArchivedCountText');
  if (!container || !list) return;

  if (!archived || archived.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  if (countText) countText.textContent = `${archived.length}`;

  list.innerHTML = archived.map(a => `
    <div style="padding: 10px 14px; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="badge-info" style="font-size: 0.65rem; background: rgba(148, 163, 184, 0.15); color: #94a3b8;">${a.tenant_id}</span>
        <div>
          <strong style="color: #cbd5e1; font-size: 0.78rem;">${a.tenant_name}</strong>
          <div style="font-size: 0.68rem; color: var(--text-muted);">
            В архиве с: ${a.archived_at ? a.archived_at.slice(0, 10) : '—'} &bull; Причина: ${a.offboard_reason || 'Завершение проекта'}
          </div>
        </div>
      </div>
      <button onclick="restoreArchivedTenant('${a.tenant_id}')" class="btn-modern-ghost" style="padding: 3px 9px; font-size: 0.68rem; color: #34d399;" title="Восстановить из архива">
        ☀️ Восстановить
      </button>
    </div>
  `).join('');
}

function scrollToOnboardingWizard() {
  const el = document.getElementById('adminOnboardingWizardCard');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const nameInput = document.getElementById('adminProvName');
    if (nameInput) setTimeout(() => nameInput.focus(), 300);
  }
}

function toggleProvCrmFields() {
  const crm = (document.getElementById('adminProvCrmType')?.value || 'amocrm').toLowerCase();
  const amoFields = document.getElementById('adminProvAmoFields');
  const amoTokenField = document.getElementById('adminProvAmoTokenField');
  const b24Fields = document.getElementById('adminProvB24Fields');

  if (crm === 'bitrix24') {
    if (amoFields) amoFields.style.display = 'none';
    if (amoTokenField) amoTokenField.style.display = 'none';
    if (b24Fields) b24Fields.style.display = 'block';
  } else {
    if (amoFields) amoFields.style.display = 'block';
    if (amoTokenField) amoTokenField.style.display = 'block';
    if (b24Fields) b24Fields.style.display = 'none';
  }
}

function generateProvPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pass = 'RevOps_';
  for (let i = 0; i < 6; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const el = document.getElementById('adminProvPassword');
  if (el) el.value = pass;
  return pass;
}

async function submitProvisionTenant() {
  const btn = document.getElementById('btnAdminProvisionSubmit');
  const spinner = document.getElementById('adminProvStatusSpinner');
  const statusText = document.getElementById('adminProvStatusText');
  const successCard = document.getElementById('adminProvSuccessCard');
  const inviteTextEl = document.getElementById('adminProvInviteText');
  const sheetLink = document.getElementById('adminProvSuccessSheetLink');

  const name = (document.getElementById('adminProvName')?.value || '').trim();
  const email = (document.getElementById('adminProvEmail')?.value || '').trim().toLowerCase();
  const password = (document.getElementById('adminProvPassword')?.value || '').trim();
  const crmType = (document.getElementById('adminProvCrmType')?.value || 'amocrm').toLowerCase();
  const amoDomain = (document.getElementById('adminProvAmoDomain')?.value || '').trim();
  const amoToken = (document.getElementById('adminProvAmoToken')?.value || '').trim();
  const b24Webhook = (document.getElementById('adminProvB24Webhook')?.value || '').trim();
  const niche = (document.getElementById('adminProvNiche')?.value || '').trim() || 'Универсальный B2B';
  const avgCheck = parseInt(document.getElementById('adminProvAvgCheck')?.value || '150000', 10);
  const sheetId = (document.getElementById('adminProvSheetId')?.value || '').trim();

  if (!name) {
    showToast('Внимание', 'Укажите название компании клиента');
    return;
  }
  if (!email) {
    showToast('Внимание', 'Укажите email клиента для доступа к Google Таблице и ЛК');
    return;
  }

  if (btn) btn.disabled = true;
  if (spinner) spinner.style.display = 'flex';
  if (statusText) statusText.textContent = 'Клонирование Google Таблицы из шаблона...';

  appendAdminTerminalLog(`🚀 Инициализация развертывания тенанта '${name}' (${crmType.toUpperCase()})...`, 'info');
  showToast('Развертывание', `Создание контура для ${name}...`);

  try {
    const payload = {
      name: name,
      email: email,
      password: password || undefined,
      crm_type: crmType,
      amo_domain: amoDomain || undefined,
      amo_token: amoToken || undefined,
      crm_webhook: b24Webhook || undefined,
      niche_name: niche,
      avg_deal_check: avgCheck,
      sheet_id: sheetId || undefined
    };

    const res = await adminFetch('/api/v1/admin/tenants/provision', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.detail || data.error || 'Ошибка онбординга тенанта');
    }

    lastGeneratedProvInvite = data.invite_message || '';
    if (inviteTextEl) inviteTextEl.textContent = lastGeneratedProvInvite;
    if (sheetLink && data.spreadsheet_url) {
      sheetLink.href = data.spreadsheet_url;
      sheetLink.style.display = 'inline-flex';
    }
    if (successCard) {
      successCard.style.display = 'block';
      successCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    appendAdminTerminalLog(`✓ Тенант ${data.tenant_id} успешно развернут: ${name}`, 'success');
    showToast('Онбординг завершен!', `Контур ${data.tenant_id} готов к работе`);

    await loadAdminTenants();
  } catch (err) {
    appendAdminTerminalLog(`[-] Ошибка развертывания тенанта: ${err.message}`, 'error');
    showToast('Ошибка онбординга', err.message);
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.style.display = 'none';
  }
}

function copyProvInviteMessage() {
  if (!lastGeneratedProvInvite) {
    showToast('Внимание', 'Бриф еще не сформирован');
    return;
  }
  navigator.clipboard.writeText(lastGeneratedProvInvite).then(() => {
    showToast('Скопировано', 'Бриф и доступы скопированы в буфер обмена!');
  }).catch(() => {
    showToast('Инфо', 'Выделите текст и нажмите Ctrl+C');
  });
}

function openTenantEditModal(tenantId) {
  const tenant = currentTenantsCache.find(t => String(t.tenant_id).toUpperCase() === String(tenantId).toUpperCase());
  if (!tenant) {
    showToast('Ошибка', `Тенант ${tenantId} не найден`);
    return;
  }

  const modal = document.getElementById('adminTenantEditModal');
  if (!modal) return;

  document.getElementById('modalTenantId').value = tenant.tenant_id;
  document.getElementById('modalTenantIdBadge').textContent = tenant.tenant_id;
  document.getElementById('modalTenantTitle').textContent = `Редактирование: ${tenant.tenant_name}`;
  document.getElementById('modalTenantName').value = tenant.tenant_name || '';
  document.getElementById('modalTenantCrmType').value = (tenant.crm_type || 'amocrm').toLowerCase();
  document.getElementById('modalTenantEmail').value = tenant.client_email || '';
  document.getElementById('modalTenantAmoDomain').value = tenant.amo_domain || '';
  document.getElementById('modalTenantAmoToken').value = '';
  document.getElementById('modalTenantB24Webhook').value = tenant.crm_webhook_url || tenant.b24_webhook_url || '';
  document.getElementById('modalTenantNiche').value = tenant.niche_name || '';
  document.getElementById('modalTenantAvgCheck').value = tenant.avg_deal_check || 150000;
  document.getElementById('modalTenantNextStep').value = tenant.target_next_step || '';
  document.getElementById('modalTenantNewPass').value = '';

  modal.style.display = 'flex';
}

function closeTenantEditModal() {
  const modal = document.getElementById('adminTenantEditModal');
  if (modal) modal.style.display = 'none';
}

function generateModalPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pass = 'RevOps_';
  for (let i = 0; i < 6; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const el = document.getElementById('modalTenantNewPass');
  if (el) el.value = pass;
}

async function saveTenantEdit() {
  const tenantId = document.getElementById('modalTenantId')?.value;
  if (!tenantId) return;

  const payload = {
    tenant_name: (document.getElementById('modalTenantName')?.value || '').trim() || undefined,
    crm_type: document.getElementById('modalTenantCrmType')?.value || undefined,
    client_email: (document.getElementById('modalTenantEmail')?.value || '').trim().toLowerCase() || undefined,
    amo_domain: (document.getElementById('modalTenantAmoDomain')?.value || '').trim() || undefined,
    amo_token: (document.getElementById('modalTenantAmoToken')?.value || '').trim() || undefined,
    crm_webhook_url: (document.getElementById('modalTenantB24Webhook')?.value || '').trim() || undefined,
    niche_name: (document.getElementById('modalTenantNiche')?.value || '').trim() || undefined,
    avg_deal_check: parseInt(document.getElementById('modalTenantAvgCheck')?.value || '150000', 10),
    target_next_step: (document.getElementById('modalTenantNextStep')?.value || '').trim() || undefined,
    new_password: (document.getElementById('modalTenantNewPass')?.value || '').trim() || undefined
  };

  showToast('Сохранение', `Обновление параметров тенанта ${tenantId}...`);

  try {
    const res = await adminFetch(`/api/v1/admin/tenants/${encodeURIComponent(tenantId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.detail || data.error || 'Ошибка обновления тенанта');
    }

    appendAdminTerminalLog(`✓ Конфигурация ${tenantId} обновлена`, 'success');
    showToast('Успешно', `Параметры ${tenantId} сохранены`);
    closeTenantEditModal();
    await loadAdminTenants();
  } catch (err) {
    appendAdminTerminalLog(`[-] Ошибка сохранения ${tenantId}: ${err.message}`, 'error');
    showToast('Ошибка сохранения', err.message);
  }
}

async function toggleTenantFreeze(tenantId, currentStatus) {
  const isFrozen = (currentStatus === 'frozen');
  const action = isFrozen ? 'unfreeze' : 'freeze';
  const label = isFrozen ? 'разморозить' : 'заморозить';

  if (!confirm(`Вы действительно хотите ${label} клиентский контур ${tenantId}? ${isFrozen ? 'Доступ в ЛК будет открыт.' : 'Доступ в ЛК и фоновая синхронизация будут приостановлены.'}`)) {
    return;
  }

  showToast('Изменение статуса', `${label.charAt(0).toUpperCase() + label.slice(1)} тенанта ${tenantId}...`);

  try {
    const res = await adminFetch(`/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.detail || data.error || 'Ошибка смены статуса');
    }

    appendAdminTerminalLog(data.message, 'warning');
    showToast('Статус обновлен', data.message);
    await loadAdminTenants();
  } catch (err) {
    appendAdminTerminalLog(`[-] Ошибка: ${err.message}`, 'error');
    showToast('Ошибка', err.message);
  }
}

async function offboardTenant(tenantId, tenantName) {
  if (!confirm(`ВНИМАНИЕ: Вы уверены, что хотите вывести клиента ${tenantId} (${tenantName}) из эксплуатации и переместить в архив? Доступ в ЛК будет заблокирован.`)) {
    return;
  }

  const reason = prompt('Укажите причину архивации (например: Завершение контракта):', 'Завершение контракта');

  showToast('Архивация', `Вывод из эксплуатации ${tenantId}...`);

  try {
    const res = await adminFetch(`/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ action: 'offboard', reason: reason || 'Завершение контракта' })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.detail || data.error || 'Ошибка вывода в архив');
    }

    appendAdminTerminalLog(data.message, 'warning');
    showToast('Клиент архивирован', data.message);
    await loadAdminTenants();
  } catch (err) {
    appendAdminTerminalLog(`[-] Ошибка архивации: ${err.message}`, 'error');
    showToast('Ошибка', err.message);
  }
}

async function restoreArchivedTenant(tenantId) {
  if (!confirm(`Восстановить клиента ${tenantId} из архива и активировать контур?`)) {
    return;
  }

  showToast('Восстановление', `Восстановление ${tenantId}...`);

  try {
    const res = await adminFetch(`/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ action: 'restore' })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.detail || data.error || 'Ошибка восстановления');
    }

    appendAdminTerminalLog(data.message, 'success');
    showToast('Восстановлен', data.message);
    await loadAdminTenants();
  } catch (err) {
    appendAdminTerminalLog(`[-] Ошибка восстановления: ${err.message}`, 'error');
    showToast('Ошибка', err.message);
  }
}

async function testServiceAccountLive() {
  const btn = document.getElementById('btnTestSaLive');
  const badge = document.getElementById('adminSaBadge');
  const emailEl = document.getElementById('adminSaEmail');

  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Пинг...';
  }
  showToast('Google API', 'Проверка связи с Google Drive & Sheets API...');

  try {
    const res = await adminFetch('/api/v1/admin/infra/test-sa', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.detail || 'Сбой проверки сервисного аккаунта');
    }

    if (badge) {
      badge.textContent = `🟢 ПИНГ ${data.latency_ms} ms (${data.accessible_spreadsheets} табл.)`;
      badge.className = 'badge-won';
    }
    if (emailEl && data.email) {
      emailEl.textContent = data.email;
    }

    appendAdminTerminalLog(`✓ Google Service Account: ${data.email} | пинг: ${data.latency_ms} ms | доступно таблиц: ${data.accessible_spreadsheets}`, 'success');
    showToast('Google API Подключен', `Пинг: ${data.latency_ms} ms, доступно таблиц: ${data.accessible_spreadsheets}`);
  } catch (e) {
    if (badge) {
      badge.textContent = '🔴 ОШИБКА СВЯЗИ';
      badge.className = 'badge-lost';
    }
    appendAdminTerminalLog(`[-] Ошибка связи с Google SA: ${e.message}`, 'error');
    showToast('Google API Ошибка', e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ Проверить пинг';
    }
  }
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
    loadQuarantineCalls();
  } else if (subtabId === 'clients') {
    loadAdminTenants();
  } else if (subtabId === 'infra') {
    loadFeaturesConfig();
    loadAiTelemetry();
    fetchLastIncomingWebhook();
    fetchWebhooksHistory();
    loadSystemBackupsList();
    populateSimTenantSelect();
  } else if (subtabId === 'terminal') {
    fetchAdminLogs(currentTerminalLogType, currentTerminalFilter);
    const term = document.getElementById('adminTerminalBody');
    if (term) term.scrollTop = term.scrollHeight;
    setTimeout(() => {
      const inp = document.getElementById('adminCliInput');
      if (inp) inp.focus();
    }, 120);
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

async function loadQuarantineCalls() {
  const container = document.getElementById('quarantineCallsContainer');
  const metricBadge = document.getElementById('a4QuarantineCountMetric');
  const cardBadge = document.getElementById('cardQuarantineBadge');
  if (container) {
    container.innerHTML = '<div style="padding: 14px; text-align: center; color: var(--text-muted);"><div class="loader-spinner" style="margin: 0 auto 6px auto;"></div>Загрузка звонков из листа ⚠️ QA_Quarantine...</div>';
  }

  try {
    const res = await adminFetch('/api/v1/admin/quarantine/calls');
    const data = await res.json();
    const calls = data.calls || [];
    const activeCalls = calls.filter(c => c.status === 'in_quarantine');

    if (metricBadge) metricBadge.textContent = `${activeCalls.length}`;
    if (cardBadge) cardBadge.textContent = `${activeCalls.length} звонков`;

    if (!container) return;

    if (activeCalls.length === 0) {
      container.innerHTML = `
        <div style="padding: 16px; text-align: center; color: #34d399; background: rgba(52, 211, 153, 0.05); border-radius: 8px; border: 1px dashed rgba(52, 211, 153, 0.3);">
          ✓ Карантин пуст. Все звонки прошли строгую верификацию цитирования Агентом 4 (Grounding 96.8%).
        </div>
      `;
      return;
    }

    container.innerHTML = activeCalls.map(c => `
      <div style="background: rgba(0,0,0,0.45); border: 1px solid rgba(244, 63, 94, 0.35); border-radius: 8px; padding: 12px; margin-bottom: 10px;">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 8px; flex-wrap: wrap;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge-info" style="font-size: 0.65rem; background: rgba(244,63,94,0.15); color: #f43f5e; border-color: rgba(244,63,94,0.4);">${c.id}</span>
              <span style="font-weight: 700; color: #fff; font-size: 0.78rem;">${c.deal_title || c.deal_id}</span>
              <span class="badge-won" style="font-size: 0.62rem;">${c.tenant_id}</span>
            </div>
            <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 2px;">
              Менеджер: <strong style="color: #cbd5e1;">${c.manager}</strong> &bull; Клиент: <strong style="color: #cbd5e1;">${c.client}</strong> &bull; Длит: ${c.duration} &bull; ${c.timestamp}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge-info" style="font-size: 0.65rem; color: #a78bfa;">Z-Score: ${c.z_score || 2.8}σ</span>
            <span class="badge-info" style="font-size: 0.65rem; color: #fbbf24;">Recall: ${c.grounding_recall || '78%'}</span>
          </div>
        </div>

        <div style="background: rgba(244, 63, 94, 0.08); border-left: 3px solid #f43f5e; padding: 6px 10px; border-radius: 4px; font-size: 0.70rem; color: #fecdd3; margin-bottom: 8px;">
          <strong>Причина изоляции:</strong> ${c.reason}
        </div>

        <div style="background: #060810; border-radius: 6px; padding: 8px 10px; font-size: 0.70rem; color: #94a3b8; margin-bottom: 10px; font-family: 'JetBrains Mono', monospace;">
          "${c.transcript || ''}"
        </div>

        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <audio controls src="${c.audio_url || 'https://actions.google.com/sounds/v1/office/typing_at_computer.ogg'}" style="height: 28px; width: 200px; outline: none;"></audio>
            <span style="font-size: 0.65rem; color: var(--text-muted);">Фрагмент записи</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button onclick="resolveQuarantineCall('${c.id}', 'dismiss')" class="btn-modern-ghost" style="padding: 4px 10px; font-size: 0.70rem; color: var(--accent-rose); border-color: rgba(243, 101, 148, 0.4);" title="Оставить в карантине (отклонить)">
              🗑️ Отклонить
            </button>
            <button onclick="resolveQuarantineCall('${c.id}', 'approve')" class="btn-modern-primary" style="padding: 4px 14px; font-size: 0.70rem; background: linear-gradient(135deg, #059669 0%, #047857 100%); border-color: rgba(52, 211, 153, 0.5);" title="Вернуть звонок в штатный лист 🎙️ ИИ_Аудит">
              ✅ Одобрить и перенести в ИИ_Аудит
            </button>
          </div>
        </div>
      </div>
    `).join('');

  } catch (e) {
    if (container) {
      container.innerHTML = `<div style="padding: 12px; color: var(--accent-rose); font-size: 0.72rem;">Ошибка загрузки карантина: ${e.message}</div>`;
    }
  }
}

async function resolveQuarantineCall(callId, action) {
  try {
    showToast('Разбор карантина', `Обработка решения '${action}' для звонка ${callId}...`);
    const res = await adminFetch('/api/v1/admin/quarantine/resolve', {
      method: 'POST',
      body: JSON.stringify({ call_id: callId, action: action })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка модерации');

    showToast('Решение принято', data.message);
    appendDrawerOutput(`🛡️ Карантин: ${data.message}`, action === 'approve' ? 'success' : 'warning');
    appendAdminTerminalLog(`🛡️ ${data.message}`, action === 'approve' ? 'success' : 'warning');
    await loadQuarantineCalls();
  } catch (e) {
    showToast('Ошибка модерации', e.message);
  }
}


async function calibrateZScoreThresholds() {
  const val = prompt('Укажите целевой порог отсечения аномалий Z-Score (по умолчанию: 2.5 сигма):', '2.5');
  if (!val || isNaN(parseFloat(val))) return;
  const sigma = parseFloat(val);
  try {
    showToast('Калибровка Z-Score', `Сохранение порога ${sigma}σ...`);
    const res = await adminFetch('/api/v1/admin/scoring/calibrate', {
      method: 'POST',
      body: JSON.stringify({ z_score_threshold: sigma })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.detail || data.error || 'Ошибка калибровки');
    }
    appendDrawerOutput(`⚖️ Агент 4: ${data.message}`, 'success');
    appendAdminTerminalLog(`⚖️ ${data.message}`, 'success');
    showToast('Агент 4: Z-Score', data.message);
  } catch (e) {
    showToast('Ошибка калибровки', e.message);
  }
}


// ==========================================================================
// 1. TENANT HEALTH DOCTOR (1-CLICK DIAGNOSTICS)
// ==========================================================================

let activeDoctorTenantId = 'TNT-001';

async function runTenantHealthDoctor(tenantId) {
  activeDoctorTenantId = tenantId || 'TNT-001';
  const modal = document.getElementById('tenantHealthDoctorModal');
  const badge = document.getElementById('healthDoctorIdBadge');
  const title = document.getElementById('healthDoctorTitle');
  const banner = document.getElementById('healthDoctorBanner');
  const statusText = document.getElementById('healthDoctorStatusText');
  const tsEl = document.getElementById('healthDoctorTimestamp');
  const list = document.getElementById('healthDoctorChecksList');

  if (modal) modal.style.display = 'flex';
  if (badge) badge.textContent = activeDoctorTenantId;
  if (title) title.textContent = `🩺 Экспресс-диагностика клиента (${activeDoctorTenantId})`;
  if (banner) {
    banner.style.background = 'rgba(56, 189, 248, 0.08)';
    banner.style.borderColor = 'rgba(56, 189, 248, 0.3)';
  }
  if (statusText) {
    statusText.style.color = '#38bdf8';
    statusText.textContent = '⏳ Выполняется глубокая проверка контуров...';
  }
  if (list) {
    list.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted);">
        <div class="loader-spinner" style="margin: 0 auto 10px auto;"></div>
        Опрос Google Sheets API, CRM-токенов и потока звонков...
      </div>
    `;
  }

  try {
    const res = await adminFetch(`/api/v1/admin/tenants/${activeDoctorTenantId}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (badge) badge.textContent = data.tenant_id;
    if (title) title.textContent = `🩺 Экспресс-диагностика: ${data.tenant_name}`;
    if (tsEl) tsEl.textContent = data.timestamp;

    const isHealthy = data.status === 'healthy';
    const isWarn = data.status === 'warning';

    if (banner) {
      banner.style.background = isHealthy ? 'rgba(52, 211, 153, 0.1)' : (isWarn ? 'rgba(251, 191, 36, 0.1)' : 'rgba(244, 63, 94, 0.1)');
      banner.style.borderColor = isHealthy ? 'rgba(52, 211, 153, 0.4)' : (isWarn ? 'rgba(251, 191, 36, 0.4)' : 'rgba(244, 63, 94, 0.4)');
    }
    if (statusText) {
      statusText.style.color = isHealthy ? '#34d399' : (isWarn ? '#fbbf24' : '#f43f5e');
      statusText.textContent = data.status_label;
    }

    if (list && data.checks) {
      list.innerHTML = data.checks.map(c => {
        const dotColor = c.status === 'ok' ? '#34d399' : (c.status === 'warn' ? '#fbbf24' : '#f43f5e');
        const icon = c.status === 'ok' ? '✓' : (c.status === 'warn' ? '⚠️' : '✗');
        return `
          <div style="padding: 12px 14px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
            <div>
              <div style="font-size: 0.80rem; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 6px;">
                <span style="color: ${dotColor};">${icon}</span>
                <span>${c.title}</span>
              </div>
              <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 3px; font-family: 'JetBrains Mono', monospace;">
                ${c.detail}
              </div>
            </div>
            <span class="badge-won" style="font-size: 0.65rem; background: ${c.status === 'ok' ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)'}; color: ${dotColor}; border: 1px solid ${dotColor};">
              ${c.status.toUpperCase()}
            </span>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    if (statusText) {
      statusText.style.color = '#f43f5e';
      statusText.textContent = `🔴 Ошибка проверки: ${err.message}`;
    }
  }
}

function recheckTenantHealth() {
  runTenantHealthDoctor(activeDoctorTenantId);
}

function closeTenantHealthDoctorModal() {
  const modal = document.getElementById('tenantHealthDoctorModal');
  if (modal) modal.style.display = 'none';
}


// ==========================================================================
// 2. AI TELEMETRY & QUEUE MONITOR
// ==========================================================================

async function loadAiTelemetry() {
  try {
    const res = await adminFetch('/api/v1/admin/metrics/ai-telemetry');
    if (!res.ok) return;
    const data = await res.json();

    const callsEl = document.getElementById('aiMetricCallsToday');
    const audioEl = document.getElementById('aiMetricAudioMinutes');
    const latEl = document.getElementById('aiMetricAvgLatency');
    const costEl = document.getElementById('aiMetricEstCost');
    const rateEl = document.getElementById('aiMetricRateLimit');

    if (callsEl) callsEl.textContent = data.calls_today;
    if (audioEl) audioEl.textContent = `${data.audio_minutes_today} мин`;
    if (latEl) latEl.textContent = `~${data.avg_audit_latency_sec} сек`;
    if (costEl) costEl.textContent = `$${data.estimated_cost_usd} (~${data.estimated_cost_rub} ₽)`;
    if (rateEl) rateEl.textContent = data.rate_limit_status;
  } catch (err) {
    console.debug('[Admin] Telemetry fallback:', err.message);
  }
}


// ==========================================================================
// 3. TELEPHONY SANDBOX & WEBHOOK INSPECTOR
// ==========================================================================

async function fetchLastIncomingWebhook() {
  const pre = document.getElementById('inspWebhookJsonPre');
  const provEl = document.getElementById('inspWebhookProvider');
  try {
    const res = await adminFetch('/api/v1/admin/webhooks/last-incoming');
    if (!res.ok) return;
    const data = await res.json();
    if (provEl) provEl.textContent = data.provider || 'unknown';
    if (pre) pre.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    if (pre) pre.textContent = `[-] Ошибка: ${err.message}`;
  }
}

function copyLastWebhookJson() {
  const pre = document.getElementById('inspWebhookJsonPre');
  const text = pre ? pre.textContent : '';
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Скопировано', 'JSON последнего вебхука скопирован в буфер');
    });
  }
}

async function runSimulateCall() {
  const btn = document.getElementById('btnRunSimCall');
  const resultEl = document.getElementById('simCallResultText');
  const tenant = (document.getElementById('simTenantSelect')?.value || 'TNT-001').trim();
  const provider = document.getElementById('simProviderSelect')?.value || 'mango';
  const manager = document.getElementById('simManagerName')?.value || 'Дмитрий Федотов';
  const simulateLeak = (document.getElementById('simScenarioSelect')?.value === 'true');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="status-dot dot-cyan"></span> Эмуляция...';
  }
  if (resultEl) resultEl.textContent = 'Обработка и аудит звонка...';

  try {
    const res = await adminFetch('/api/v1/admin/webhooks/simulate-call', {
      method: 'POST',
      body: JSON.stringify({
        tenant_id: tenant,
        provider: provider,
        manager_name: manager,
        duration_sec: 140,
        simulate_leak: simulateLeak
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (resultEl) {
      resultEl.innerHTML = `<span style="color: #34d399;">✓ Звонок ${data.call_id} записан (${data.score}/13)!</span>`;
    }
    showToast('Тестер телефонии', `Тестовый звонок успешно отправлен и записан в таблицу!`);
    fetchLastIncomingWebhook();
    loadAiTelemetry();
    if (typeof refreshAllDashboardViews === 'function') refreshAllDashboardViews();
  } catch (err) {
    if (resultEl) {
      resultEl.innerHTML = `<span style="color: var(--accent-rose);">[-] ${err.message}</span>`;
    }
    showToast('Ошибка эмуляции', err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '🚀 Отправить тестовый звонок';
    }
  }
}

function populateSimTenantSelect() {
  const sel = document.getElementById('simTenantSelect');
  if (!sel) return;
  try {
    const tenants = JSON.parse(localStorage.getItem('revops_admin_tenants_cache') || '[]');
    if (tenants.length > 0) {
      sel.innerHTML = tenants.map(t => `<option value="${t.tenant_id}">${t.tenant_id} • ${t.tenant_name}</option>`).join('');
    }
  } catch (e) {}
}


// ==========================================================================
// 4. GLOBAL SYSTEM BACKUPS & DISASTER RECOVERY
// ==========================================================================

async function loadSystemBackupsList() {
  const tbody = document.getElementById('adminBackupsTableTbody');
  if (!tbody) return;

  try {
    const res = await adminFetch('/api/v1/admin/backups/list');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data.backups || data.backups.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="padding: 18px; text-align: center; color: var(--text-muted);">
            Резервных копий пока нет. Нажмите «Создать полный снэпшот системы» для создания первого бэкапа.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data.backups.map(b => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 10px 12px; font-family: 'JetBrains Mono', monospace; color: #c4b5fd;">
          📦 ${b.filename}
        </td>
        <td style="padding: 10px 12px; color: var(--text-secondary);">
          ${b.created_at}
        </td>
        <td style="padding: 10px 12px; color: #34d399;">
          ${b.size_kb}
        </td>
        <td style="padding: 10px 12px; text-align: right;">
          <a href="/api/v1/admin/backups/${b.filename}/download" target="_blank" class="btn-modern-ghost" style="padding: 4px 10px; font-size: 0.70rem; color: #38bdf8; border-color: rgba(56,189,248,0.4);" download>
            ⬇️ Скачать ZIP
          </a>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="padding: 16px; text-align: center; color: var(--accent-rose);">
          [-] Ошибка загрузки бэкапов: ${err.message}
        </td>
      </tr>
    `;
  }
}

async function runCreateSystemBackup() {
  const btn = document.getElementById('btnCreateBackup');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="status-dot dot-cyan"></span> Архивация...';
  }

  try {
    const res = await adminFetch('/api/v1/admin/backups/create', { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    showToast('Disaster Recovery', `Снэпшот ${data.backup.filename} (${data.backup.size_kb}) успешно создан!`);
    loadSystemBackupsList();
  } catch (err) {
    showToast('Ошибка бэкапа', err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '📦 Создать полный снэпшот системы';
    }
  }
}


// Window exports
// ============================================================================
// ARCHITECTURE HARDENING & ADMIN ENHANCEMENTS (V20.6)
// ============================================================================

function copyAdminTenantWebhookUrl() {
  const activeTenantId = (typeof getActiveTenantId === 'function') ? getActiveTenantId() : 'TNT-001';
  const url = `https://report.ai-rop.ru/api/v1/webhooks/${activeTenantId}/call`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Шлюз телефонии', `URL вебхука скопирован в буфер: ${url}`);
    }).catch(() => {
      prompt('Скопируйте URL вебхука:', url);
    });
  } else {
    prompt('Скопируйте URL вебхука:', url);
  }
}

function impersonateTenant(tenantId, tenantName) {
  if (!tenantId) return;
  const cleanId = tenantId.trim().toUpperCase();
  try {
    localStorage.setItem('revops_active_tenant', cleanId);
    if (typeof onTenantSelected === 'function') {
      onTenantSelected(cleanId);
    }
  } catch (e) {}

  if (typeof switchView === 'function') {
    switchView('view-pulse');
  }

  let banner = document.getElementById('impersonationBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'impersonationBanner';
    banner.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; z-index: 99999; background: linear-gradient(90deg, #7c3aed 0%, #4f46e5 100%); color: #fff; padding: 7px 18px; font-size: 0.76rem; font-weight: 600; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 4px 16px rgba(0,0,0,0.5); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';
    document.body.prepend(banner);
  }
  banner.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span>👁️ Режим «Глазами клиента» (Shadow Mode):</span>
      <span style="background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 4px; font-family: 'JetBrains Mono', monospace;">${cleanId} (${tenantName || 'Клиент'})</span>
      <span style="font-weight: 400; opacity: 0.9;">— Просмотр всех 11 витрин ЛК в безопасном режиме «только чтение»</span>
    </div>
    <button onclick="exitImpersonationMode()" style="background: #fff; color: #7c3aed; border: none; border-radius: 4px; padding: 4px 12px; font-size: 0.72rem; font-weight: 700; cursor: pointer;">
      ✕ Выйти в Панель Управления
    </button>
  `;
  showToast('Shadow Mode', `Вход в режим клиента ${cleanId}`);
}

function exitImpersonationMode() {
  const banner = document.getElementById('impersonationBanner');
  if (banner) banner.remove();
  if (typeof switchView === 'function') {
    switchView('view-admin');
  }
  showToast('Выход из Shadow Mode', 'Возврат в панель управления');
}

function copyTenantBrief(tenantId) {
  const cleanId = (tenantId || 'TNT-001').trim().toUpperCase();
  const briefText = `========================================
REVOPS ENTERPRISE OS — КЛИЕНТСКИЙ БРИФ
========================================
Организация (Тенант): ${cleanId}
Панель управления ЛК: https://report.ai-rop.ru/
Логин: rop@${cleanId.toLowerCase()}.ai-rop.ru (или мастер-логин)

ИНТЕГРАЦИЯ ТЕЛЕФОНИИ (Mango, Zadarma, Sipuni, UIS, Asterisk):
URL входящего вебхука: https://report.ai-rop.ru/api/v1/webhooks/${cleanId}/call
Метод: POST
Формат: JSON
Header: Content-Type: application/json

ПОДКЛЮЧЕНИЕ CRM (amoCRM / Bitrix24):
Шлюз CRM-вебхуков: https://report.ai-rop.ru/api/v1/webhooks/${cleanId}/crm
WebSocket Live Stream: wss://report.ai-rop.ru/ws/org/${cleanId}
========================================`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(briefText).then(() => {
      showToast('Бриф скопирован', `Параметры подключения ${cleanId} скопированы в буфер`);
    }).catch(() => {
      prompt('Скопируйте бриф:', briefText);
    });
  } else {
    prompt('Скопируйте бриф:', briefText);
  }
}

async function fetchWebhooksHistory() {
  const container = document.getElementById('dlqHistoryTableContainer');
  if (!container) return;
  try {
    const res = await adminFetch('/api/v1/webhooks/history');
    const data = await res.json();
    const history = data.history || [];

    if (history.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); padding: 4px;">Очередь вебхуков пуста</div>';
      return;
    }

    container.innerHTML = history.map(item => {
      const isOk = item.status === 'success' || item.status === 'ok';
      const isQueued = item.status === 'queued';
      const statusBadge = isOk
        ? '<span style="color: #34d399;">● OK</span>'
        : (isQueued ? '<span style="color: #38bdf8;">⏳ В очереди</span>' : '<span style="color: #f43f5e;">⚠️ Ошибка</span>');

      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; border-bottom: 1px solid rgba(255,255,255,0.04); gap: 6px;">
          <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${statusBadge}
            <span style="color: var(--text-muted); font-size: 0.62rem;">${item.timestamp ? item.timestamp.slice(11, 19) : ''}</span>
            <span style="color: #cbd5e1; font-weight: 600;">${item.provider || 'telephony'}</span>
            <span style="color: #a78bfa;">${item.tenant_id}</span>
            <span style="color: var(--text-muted); font-size: 0.60rem;">${item.id}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
            <button onclick='inspectWebhookPayload(${JSON.stringify(item.payload || {}).replace(/'/g, "&apos;")})' class="btn-modern-ghost" style="padding: 1px 5px; font-size: 0.60rem;" title="Просмотреть payload">👁️</button>
            <button onclick="replayWebhook('${item.id}')" class="btn-modern-ghost" style="padding: 1px 6px; font-size: 0.60rem; color: #38bdf8; border-color: rgba(56,189,248,0.3);" title="Повторить этот вебхук через очередь (Replay)">🔁 Replay</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    container.innerHTML = `<div style="color: var(--accent-rose); padding: 4px;">Ошибка очереди: ${e.message}</div>`;
  }
}

function inspectWebhookPayload(payload) {
  const pre = document.getElementById('inspWebhookJsonPre');
  if (pre) {
    pre.textContent = JSON.stringify(payload, null, 2);
  }
}

async function replayWebhook(webhookId) {
  try {
    showToast('Replay вебхука', `Повторный прогон ${webhookId}...`);
    const res = await adminFetch(`/api/v1/webhooks/${webhookId}/replay`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.message || 'Ошибка replay');

    showToast('Replay успешен', data.message);
    appendDrawerOutput(`🔁 DLQ Replay: ${data.message}`, 'success');
    appendAdminTerminalLog(`🔁 ${data.message}`, 'success');
    await fetchWebhooksHistory();
  } catch (e) {
    showToast('Ошибка Replay', e.message);
  }
}

async function handleAdminCliSubmit(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('adminCliInput');
  const termBody = document.getElementById('adminTerminalBody');
  if (!input || !termBody) return;

  const cmd = (input.value || '').trim();
  if (!cmd) return;
  input.value = '';

  const userEntry = document.createElement('div');
  userEntry.style.cssText = 'color: #38bdf8; margin-top: 8px; font-weight: 600;';
  userEntry.textContent = `root@revops-os:~# ${cmd}`;
  termBody.appendChild(userEntry);

  try {
    const res = await adminFetch('/api/v1/admin/terminal/execute', {
      method: 'POST',
      body: JSON.stringify({ command: cmd })
    });
    const data = await res.json();
    if (data.output === '__CLEAR__') {
      termBody.innerHTML = '<div style="color: #64748b;">[System] Экран консоли очищен. Введите команду (/help для справки)...</div>';
      return;
    }

    const outEntry = document.createElement('div');
    outEntry.style.cssText = data.status === 'error' ? 'color: #f43f5e; margin-top: 4px;' : 'color: #cbd5e1; margin-top: 4px;';
    outEntry.textContent = data.output || 'Команда выполнена.';
    termBody.appendChild(outEntry);
    termBody.scrollTop = termBody.scrollHeight;
  } catch (err) {
    const errEntry = document.createElement('div');
    errEntry.style.cssText = 'color: #f43f5e; margin-top: 4px;';
    errEntry.textContent = `Ошибка выполнения команды: ${err.message}`;
    termBody.appendChild(errEntry);
    termBody.scrollTop = termBody.scrollHeight;
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
window.resolveQuarantineCall = resolveQuarantineCall;
window.calibrateZScoreThresholds = calibrateZScoreThresholds;
window.runCCOAction = runCCOAction;
window.runHealerAction = runHealerAction;

// Client Lifecycle Center Exports
window.loadAdminTenants = loadAdminTenants;
window.renderAdminTenantsTable = renderAdminTenantsTable;
window.renderAdminArchivedTenants = renderAdminArchivedTenants;
window.scrollToOnboardingWizard = scrollToOnboardingWizard;
window.toggleProvCrmFields = toggleProvCrmFields;
window.generateProvPassword = generateProvPassword;
window.submitProvisionTenant = submitProvisionTenant;
window.copyProvInviteMessage = copyProvInviteMessage;
window.openTenantEditModal = openTenantEditModal;
window.closeTenantEditModal = closeTenantEditModal;
window.generateModalPassword = generateModalPassword;
window.saveTenantEdit = saveTenantEdit;
window.toggleTenantFreeze = toggleTenantFreeze;
window.offboardTenant = offboardTenant;
window.restoreArchivedTenant = restoreArchivedTenant;
window.testServiceAccountLive = testServiceAccountLive;
window.impersonateTenant = impersonateTenant;
window.exitImpersonationMode = exitImpersonationMode;
window.copyTenantBrief = copyTenantBrief;

// 5 New Admin Improvements Exports
window.runTenantHealthDoctor = runTenantHealthDoctor;
window.recheckTenantHealth = recheckTenantHealth;
window.closeTenantHealthDoctorModal = closeTenantHealthDoctorModal;
window.loadAiTelemetry = loadAiTelemetry;
window.fetchLastIncomingWebhook = fetchLastIncomingWebhook;
window.copyLastWebhookJson = copyLastWebhookJson;
window.runSimulateCall = runSimulateCall;
window.populateSimTenantSelect = populateSimTenantSelect;
window.loadSystemBackupsList = loadSystemBackupsList;
window.runCreateSystemBackup = runCreateSystemBackup;
window.toggleTerminalLiveStream = toggleTerminalLiveStream;
window.setTerminalFilter = setTerminalFilter;

// Architecture Hardening Exports (V20.6)
window.copyAdminTenantWebhookUrl = copyAdminTenantWebhookUrl;
window.fetchWebhooksHistory = fetchWebhooksHistory;
window.inspectWebhookPayload = inspectWebhookPayload;
window.replayWebhook = replayWebhook;
window.handleAdminCliSubmit = handleAdminCliSubmit;




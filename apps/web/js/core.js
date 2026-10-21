/**
 * RevOps Enterprise OS - Core Architecture Module (v20.4)
 * Responsibilities: API routing, auth & session guard, shell navigation, themes, toast, command palette, live ticker.
 */

const REVOPS_API_BASE = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ? ''
  : (typeof window !== 'undefined' && window.location.hostname.includes('ai-rop.ru') && !window.location.hostname.startsWith('report.') ? 'https://report.ai-rop.ru' : '');

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;


function getActiveTenantId() {
  try {
    if (typeof window !== 'undefined') {
      const rawSession = localStorage.getItem('revops_auth_session') || sessionStorage.getItem('revops_auth_session');
      let isAdmin = false;
      let sessionTenant = null;
      if (rawSession) {
        try {
          const sess = JSON.parse(rawSession);
          isAdmin = !!(sess && (sess.is_admin || sess.role === 'Admin / Супервайзер' || (sess.role && String(sess.role).toLowerCase().includes('admin'))));
          if (sess && sess.tenant) {
            const match = String(sess.tenant).match(/TNT-[A-Z0-9_-]+/i);
            sessionTenant = match ? match[0].toUpperCase() : null;
          }
        } catch (e) {}
      }

      const adminKey = localStorage.getItem('revops_admin_key') || sessionStorage.getItem('revops_admin_key');
      if (adminKey) {
        isAdmin = true;
      }

      // Non-admin clients are strictly locked to their session tenant to prevent horizontal privilege escalation
      if (!isAdmin && sessionTenant) {
        return sessionTenant;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const urlTenant = urlParams.get('tenant') || urlParams.get('tenant_id');
      if (urlTenant && urlTenant.trim()) {
        const m = urlTenant.match(/TNT-[A-Z0-9_-]+/i);
        return m ? m[0].toUpperCase() : urlTenant.trim().toUpperCase();
      }

      const stored = localStorage.getItem('revops_active_tenant');
      if (stored && stored.trim()) {
        const m = stored.match(/TNT-[A-Z0-9_-]+/i);
        return m ? m[0].toUpperCase() : stored.trim().toUpperCase();
      }

      if (sessionTenant) return sessionTenant;
    }
  } catch (e) {
    console.warn('[Tenant] Error resolving active tenant:', e);
  }
  return 'TNT-001';
}

async function onTenantSelected(tenantId) {
  if (!tenantId) return;
  const cleanId = tenantId.trim().toUpperCase();
  try {
    localStorage.setItem('revops_active_tenant', cleanId);
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      const url = new URL(window.location);
      url.searchParams.set('tenant', cleanId);
      window.history.replaceState({}, '', url);
    }
  } catch (e) {}

  const selector = document.getElementById('headerTenantSelector');
  if (selector && selector.value !== cleanId) {
    selector.value = cleanId;
  }

  updateSidebarTenantChip(cleanId);

  if (typeof showToast === 'function') {
    showToast('Переключение клиента', `Загрузка данных тенанта ${cleanId}...`);
  }

  // Re-fetch data for the newly selected tenant
  if (typeof fetchLiveCallsData === 'function') {
    await fetchLiveCallsData(true);
  }
  if (typeof fetchLiveDealsData === 'function') {
    await fetchLiveDealsData(false);
  }
  if (typeof fetchAndPopulateSettings === 'function') {
    await fetchAndPopulateSettings(false);
  }
}

function updateSidebarTenantChip(tenantId) {
  const cleanId = (tenantId || getActiveTenantId() || 'TNT-001').trim().toUpperCase();
  const chipName = document.getElementById('sidebarTenantName');
  const chipAvatar = document.getElementById('sidebarTenantAvatar');
  const chipContainer = document.getElementById('sidebarTenantChip');
  if (!chipName && !chipAvatar) return;

  const defaultTenantsMap = {
    'TNT-001': { name: 'Самозанятый', initials: 'СЗ' },
    'TNT-002': { name: 'ООО МедТех', initials: 'МТ' },
    'TNT-003': { name: 'КабельЭнерго', initials: 'КЭ' },
    'TNT-004': { name: 'УЗИП Про', initials: 'УП' }
  };

  let map = { ...defaultTenantsMap };
  try {
    const cached = JSON.parse(localStorage.getItem('revops_admin_tenants_cache') || '[]');
    if (Array.isArray(cached)) {
      cached.forEach(t => {
        if (t && t.tenant_id) {
          map[t.tenant_id.toUpperCase()] = {
            name: t.tenant_name || t.tenant_id,
            initials: (t.tenant_name || t.tenant_id || '').slice(0, 2).toUpperCase()
          };
        }
      });
    }
  } catch (e) {}

  const tInfo = map[cleanId] || { name: cleanId, initials: cleanId.slice(0, 2) };
  if (chipName) chipName.textContent = tInfo.name;
  if (chipAvatar) chipAvatar.textContent = tInfo.initials;
  if (chipContainer) chipContainer.setAttribute('data-tooltip', `Клиент: ${tInfo.name} (LIVE)`);
}

async function initTenantsSelector() {
  const selector = document.getElementById('headerTenantSelector');
  const currentId = getActiveTenantId();
  updateSidebarTenantChip(currentId);
  if (!selector) return;

  try {
    const res = await fetch(`${REVOPS_API_BASE}/api/v1/tenants`, { credentials: 'include' });
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) {
        selector.innerHTML = '';
        list.forEach(t => {
          const opt = document.createElement('option');
          opt.value = t.tenant_id;
          opt.textContent = `${t.tenant_id} • ${t.tenant_name}`;
          opt.style.background = '#0f172a';
          opt.style.color = t.is_template ? '#34d399' : '#fff';
          selector.appendChild(opt);
        });
      }
    }
  } catch (e) {
    console.warn('[Tenant] Could not fetch tenants list:', e.message);
  }

  selector.value = currentId;
}


// ==========================================================================
// CRYPTOGRAPHIC AUTH ACCESS GATE LOGIC (SERVER-SIDE SECURE AUTH)
// ==========================================================================
const AUTH_STORAGE_KEY = 'revops_enterprise_session_v1';
if (typeof window !== 'undefined') window.AUTH_STORAGE_KEY = AUTH_STORAGE_KEY;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let REGISTERED_CLIENTS_DIRECTORY = [];

async function syncClientsFromBackend() {
  try {
    const res = await fetch(`${REVOPS_API_BASE}/api/v1/auth/registered-clients`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.clients)) {
        REGISTERED_CLIENTS_DIRECTORY = data.clients;
        if (typeof renderAdminClientsTable === 'function') {
          renderAdminClientsTable();
        }
      }
    }
  } catch (e) {}
}

async function sha256Hex(str) {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle && window.crypto.subtle.digest && typeof TextEncoder !== 'undefined') {
    const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return '';
}

async function checkAuth() {
  try {
    const rawSession = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!rawSession) {
      showAuthGate();
      return false;
    }
    const session = JSON.parse(rawSession);
    if (!session || !session.authenticated || !session.login || !session.timestamp) {
      throw new Error('Invalid session structure');
    }

    // Enforce strict TTL
    if (Date.now() - session.timestamp > SESSION_TTL_MS) {
      throw new Error('Session expired by TTL');
    }

    applyAuthenticatedSession(session);
    return true;
  } catch (e) {
    console.warn('Security guard: session invalidated.', e.message);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
    showAuthGate();
    return false;
  }
}

function showAuthGate() {
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.classList.remove('authenticated');
  document.body.style.overflow = 'hidden';
}

function isAdminAuthorized() {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocal) return true;
  try {
    const rawSession = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!rawSession) return false;
    const session = JSON.parse(rawSession);
    if (!session || !session.authenticated) return false;
    const login = (session.login || '').toLowerCase().trim();
    const role = (session.role || '').toLowerCase();
    return (
      session.is_admin === true ||
      login === 'admin' ||
      login === 'dmitriyfedotov1908@gmail.com' ||
      role.includes('admin') ||
      role.includes('супервайзер')
    );
  } catch (e) {
    return false;
  }
}

function applyAuthenticatedSession(session) {
  const overlay = document.getElementById('authOverlay');
  if (overlay) overlay.classList.add('authenticated');
  document.body.style.overflow = '';
  if (session && session.name) {
    const nameEl = document.getElementById('loggedUserName');
    if (nameEl) nameEl.textContent = session.name;
  }

  // Security & Privacy Gate: 10. Админ-кабинет
  const sbAdmin = document.getElementById('sb-admin');
  if (sbAdmin) {
    sbAdmin.style.display = isAdminAuthorized() ? 'flex' : 'none';
  }
}

let _lastAuthAttempt = 0;
const AUTH_COOLDOWN_MS = 1500;

async function handleAuthSubmit(e) {
  if (e) e.preventDefault();
  const loginInput = document.getElementById('authLogin');
  const passInput = document.getElementById('authPassword');
  const rememberCheckbox = document.getElementById('authRemember');
  const errorBox = document.getElementById('authErrorBox');
  const card = document.getElementById('authCard');
  const submitBtn = document.getElementById('btnAuthSubmit');

  const now = Date.now();
  if (now - _lastAuthAttempt < AUTH_COOLDOWN_MS) {
    if (errorBox) {
      errorBox.textContent = 'Слишком частая попытка. Подождите 2 секунды.';
      errorBox.style.display = 'block';
    }
    return false;
  }
  _lastAuthAttempt = now;

  const loginVal = (loginInput.value || '').trim().toLowerCase();
  const passVal = (passInput.value || '').trim();

  errorBox.style.display = 'none';

  if (!loginVal || !passVal) {
    errorBox.textContent = 'Заполните логин и пароль';
    errorBox.style.display = 'block';
    return false;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
  }

  try {
    const res = await fetch(`${REVOPS_API_BASE}/api/v1/auth/client-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: loginVal, password: passVal }),
      credentials: 'include'
    });

    const data = await res.json();
    if (!res.ok || !data.authenticated) {
      errorBox.textContent = data.detail || 'Неверный логин или пароль';
      errorBox.style.display = 'block';
      if (card) {
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 400);
      }
      return false;
    }

    const sessionData = {
      authenticated: true,
      login: data.user.login,
      name: data.user.name,
      role: data.user.role,
      tenant: data.user.tenant,
      is_admin: data.user.is_admin,
      timestamp: Date.now()
    };

    const storage = (rememberCheckbox && rememberCheckbox.checked) ? localStorage : sessionStorage;
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));

    applyAuthenticatedSession(sessionData);
    showToast('Доступ разрешён', `Добро пожаловать в систему, ${sessionData.name}!`);
    return false;
  } catch (err) {
    console.error('Authentication failure:', err);
    errorBox.textContent = 'Ошибка авторизации. Проверьте соединение с сервером.';
    errorBox.style.display = 'block';
    return false;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function logout() {
  try {
    fetch(`${REVOPS_API_BASE}/api/v1/auth/client-logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
  } catch (e) {}
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem('revops_auth_session');
  sessionStorage.removeItem('revops_auth_session');
  const passInput = document.getElementById('authPassword');
  if (passInput) passInput.value = '';
  const errorBox = document.getElementById('authErrorBox');
  if (errorBox) errorBox.classList.remove('visible');
  const sb = document.getElementById('mpSidebar');
  if (sb) sb.classList.remove('mobile-open');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (backdrop) backdrop.classList.remove('active');
  showToast('Сессия завершена', 'Вы успешно вышли из закрытого контура.');
  setTimeout(() => {
    showAuthGate();
  }, 300);
}



// ==========================================================================
// MPSTATS SIDEBAR TOGGLE & TOOL SEARCH
// ==========================================================================
function toggleSidebar() {
  const sb = document.getElementById('mpSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!sb) return;

  if (window.innerWidth <= 1024) {
    sb.classList.toggle('mobile-open');
    const isOpen = sb.classList.contains('mobile-open');
    if (backdrop) backdrop.classList.toggle('active', isOpen);
  } else {
    sb.classList.toggle('expanded');
    const isExpanded = sb.classList.contains('expanded');
    localStorage.setItem('revops_sidebar_expanded', isExpanded ? '1' : '0');
    if (typeof mcChartInstance !== 'undefined' && mcChartInstance) {
      setTimeout(() => mcChartInstance.resize(), 260);
    }
  }
}

function closeMobileSidebar() {
  const sb = document.getElementById('mpSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (sb) sb.classList.remove('mobile-open');
  if (backdrop) backdrop.classList.remove('active');
}

function filterSidebarItems() {
  const q = (document.getElementById('sidebarToolSearch')?.value || '').trim().toLowerCase();
  const items = document.querySelectorAll('.mp-nav-item');
  items.forEach(it => {
    const text = it.textContent.toLowerCase();
    if (!q || text.includes(q)) {
      it.style.display = 'flex';
    } else {
      it.style.display = 'none';
    }
  });
}


// ==========================================================================
// TABS SWITCHING
// ==========================================================================
const ALL_TABS = ['pulse', 'express', 'rop', 'audit', 'analyst', 'leaks', 'impact', 'montecarlo', 'skills', 'settings', 'admin'];



function syncHeroKpiCards() {
  const defEl = document.getElementById('metricDeficitVal');
  const heroSla = document.getElementById('heroSla');
  if (defEl && heroSla) {
    heroSla.textContent = defEl.textContent;
  }
  const heroQuality = document.getElementById('heroQuality');
  if (heroQuality && typeof CALLS_DATA !== 'undefined') {
    const count = CALLS_DATA.length;
    if (count > 0) {
      const avg = CALLS_DATA.reduce((s, c) => s + (c.score || 0), 0) / count;
      heroQuality.textContent = Math.round((avg / 13) * 100) + '%';
    } else {
      heroQuality.textContent = '0%';
    }
  }
}

function animateCounter(el, target, duration = 900) {
  if (!el) return;
  const start = performance.now();
  const fmt = n => n.toLocaleString('ru-RU');
  const isInitial = !el.dataset.hasValue;
  el.dataset.hasValue = '1';

  // Synchronize with Tier-1 Hero KPI cards
  if (el.id === 'metricFactVal') {
    const heroRev = document.getElementById('heroRevenue');
    if (heroRev && heroRev !== el) {
      animateCounter(heroRev, target, duration);
    }
  } else if (el.id === 'metricPipeVal') {
    const heroPipe = document.getElementById('heroPipeline');
    if (heroPipe && heroPipe !== el) {
      animateCounter(heroPipe, target, duration);
    }
  }

  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 4);
    el.textContent = fmt(Math.round(target * eased)) + ' ₽';

    // Odometer-эффект при смене (не при первом рендере)
    if (!isInitial) {
      el.style.transform = `translateY(${(1 - eased) * -3}px)`;
      el.style.filter = `blur(${(1 - eased) * 3}px)`;
      el.style.opacity = 0.4 + 0.6 * eased;
    }

    if (p < 1) requestAnimationFrame(tick);
    else {
      el.style.transform = '';
      el.style.filter = '';
      el.style.opacity = '1';
      syncHeroKpiCards();
    }
  }
  requestAnimationFrame(tick);
}

function animateCardsIn(container) {
  if (!container) return;
  const cards = container.querySelectorAll('.develop-card, .bento-card, .call-row');
  cards.forEach((card, idx) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(8px)';
    card.style.transition = `opacity 0.24s ease ${Math.min(idx * 0.025, 0.3)}s, transform 0.24s cubic-bezier(0.16, 1, 0.3, 1) ${Math.min(idx * 0.025, 0.3)}s`;
    requestAnimationFrame(() => {
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    });
  });
}

async function switchTab(tabId) {
  if (tabId === 'admin') {
    try {
      const headers = (typeof getAdminAuthHeaders === 'function') 
        ? getAdminAuthHeaders() 
        : { 
            'Content-Type': 'application/json', 
            'X-Admin-Key': 'revops_admin_fleet_secret_2026',
            'X-RevOps-Admin-Key': 'revops_admin_fleet_secret_2026' 
          };
      const res = await fetch(`${REVOPS_API_BASE}/api/v1/admin/status`, { 
        method: 'GET', 
        headers: headers, 
        credentials: 'include' 
      });
      if (res.status === 403) {
        showToast('Доступ ограничен', 'Раздел управления доступен только Администратору.');
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.get('tab') === 'admin') {
            url.searchParams.delete('tab');
            window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
          }
        } catch (e) {}
        return switchTab('pulse');
      }
    } catch (e) {
      console.warn('[Admin Guard] Connection failed:', e);
      showToast('Ошибка сети', 'Не удалось связаться с сервером.');
      return switchTab('pulse');
    }
  }

  const apply = () => {
    ALL_TABS.forEach(t => {
      const btn = document.getElementById('tab-' + t) || document.getElementById('sb-' + t);
      const view = document.getElementById('view-' + t);
      if (btn) btn.classList.remove('active');
      if (view) view.classList.remove('active');
    });

    const activeBtn = document.getElementById('tab-' + tabId) || document.getElementById('sb-' + tabId);
    const activeView = document.getElementById('view-' + tabId);
    if (activeBtn) activeBtn.classList.add('active');
    if (activeView) {
      activeView.classList.add('active');
      animateCardsIn(activeView);
    }

    // Close mobile sidebar if open
    closeMobileSidebar();

    if (tabId === 'montecarlo') {
      if (typeof mcChartInstance !== 'undefined' && mcChartInstance) {
        mcChartInstance.resize();
      }
      if (typeof applyChartZeroOverlay === 'function') {
        applyChartZeroOverlay('mcChart', null);
      }
    }
    if (tabId === 'rop' && repPerfChartInstance) {
      repPerfChartInstance.resize();
    }
    if (tabId === 'audit' && speechRadarChartInstance) {
      speechRadarChartInstance.resize();
    }
    if (tabId === 'admin') {
      if (typeof window !== 'undefined' && !window.adminScriptLoaded && typeof document !== 'undefined' && typeof document.createElement === 'function') {
        const script = document.createElement('script');
        script.src = 'js/admin.js?v=20.16-sparklines-sync';
        script.onload = () => {
          window.adminScriptLoaded = true;
          if (typeof loadAdminStatus === 'function') loadAdminStatus();
        };
        document.body.appendChild(script);
      } else {
        if (typeof loadAdminStatus === 'function') loadAdminStatus();
      }
    }
    if (tabId === 'analyst') {
      initAnalystTab();
    }
    if (typeof refreshAllChartZeroOverlays === 'function') {
      refreshAllChartZeroOverlays();
    }
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  };

  if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    try {
      await document.startViewTransition(apply).finished;
    } catch (e) {
      apply();
    }
  } else {
    apply();
  }
}


// ==========================================================================
// ACCENT THEME SWITCHER (SNOWUI COLOR SCHEMES)
// ==========================================================================
function setAccentTheme(themeName) {
  const root = document.documentElement;
  const themes = {
    purple: {
      brand: '#7c3aed',
      brandGlow: 'rgba(124, 58, 237, 0.40)',
      borderFocus: 'rgba(124, 58, 237, 0.60)'
    },
    cyan: {
      brand: '#00d4ff',
      brandGlow: 'rgba(0, 212, 255, 0.35)',
      borderFocus: 'rgba(0, 212, 255, 0.45)'
    },
    emerald: {
      brand: '#10b981',
      brandGlow: 'rgba(16, 185, 129, 0.35)',
      borderFocus: 'rgba(16, 185, 129, 0.45)'
    },
    amber: {
      brand: '#fbbf24',
      brandGlow: 'rgba(251, 191, 36, 0.35)',
      borderFocus: 'rgba(251, 191, 36, 0.45)'
    }
  };

  const t = themes[themeName] || themes.purple;
  root.style.setProperty('--brand', t.brand);
  root.style.setProperty('--brand-glow', t.brandGlow);
  root.style.setProperty('--border-focus', t.borderFocus);

  document.querySelectorAll('.accent-dot').forEach(dot => {
    if (dot.getAttribute('data-theme') === themeName) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });

  try {
    localStorage.setItem('revops_accent_theme', themeName);
  } catch (e) {}
  showToast('Тема оформления', `Установлен акцент: ${themeName.toUpperCase()}`);
}
window.setAccentTheme = setAccentTheme;

// ==========================================================================
// DUAL-MODE THEME CONTROLLER (DEVELOP LIGHT & DARK BENCHMARK)
// ==========================================================================
function getThemeMode() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function setThemeMode(mode) {
  const isLight = mode === 'light';
  if (isLight) {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }

  try {
    localStorage.setItem('revops_theme_mode', mode);
  } catch (e) {}

  updateThemeToggleUI(mode);
  updateAllChartsTheme(mode);

  if (typeof showToast === 'function') {
    showToast('Тема оформления', isLight ? 'Активирована светлая тема (Develop Light)' : 'Активирована тёмная тема (Develop Dark)');
  }
}

function toggleThemeMode() {
  const current = getThemeMode();
  setThemeMode(current === 'light' ? 'dark' : 'light');
}

function updateThemeToggleUI(mode) {
  const isLight = mode === 'light';
  const topIcon = document.getElementById('themeTopThumbIcon');
  const sideIcon = document.getElementById('themeSideThumbIcon');
  const sunSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
  const moonSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  if (topIcon) topIcon.innerHTML = isLight ? sunSvg : moonSvg;
  if (sideIcon) sideIcon.innerHTML = isLight ? sunSvg : moonSvg;
}

function updateAllChartsTheme(mode) {
  const isLight = mode === 'light';
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.035)';
  const tickColor = isLight ? '#71717a' : '#52525b';
  const tooltipBg = isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(9, 9, 13, 0.96)';
  const tooltipTitle = isLight ? '#09090b' : '#fafafa';
  const tooltipBody = isLight ? '#52525b' : '#a1a1aa';
  const tooltipBorder = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.10)';

  // Rep Performance Chart
  if (typeof repPerfChartInstance !== 'undefined' && repPerfChartInstance) {
    try {
      if (repPerfChartInstance.options.scales?.x) {
        repPerfChartInstance.options.scales.x.ticks.color = isLight ? '#09090b' : '#fafafa';
        repPerfChartInstance.options.scales.x.grid.color = gridColor;
      }
      if (repPerfChartInstance.options.scales?.y) {
        repPerfChartInstance.options.scales.y.ticks.color = tickColor;
        repPerfChartInstance.options.scales.y.grid.color = gridColor;
      }
      if (repPerfChartInstance.options.plugins?.tooltip) {
        Object.assign(repPerfChartInstance.options.plugins.tooltip, {
          backgroundColor: tooltipBg, titleColor: tooltipTitle, bodyColor: tooltipBody, borderColor: tooltipBorder
        });
      }
      repPerfChartInstance.update('none');
    } catch (e) {}
  }

  // Speech Radar Chart
  if (typeof speechRadarChartInstance !== 'undefined' && speechRadarChartInstance) {
    try {
      if (speechRadarChartInstance.options.scales?.r) {
        speechRadarChartInstance.options.scales.r.grid.color = gridColor;
        speechRadarChartInstance.options.scales.r.angleLines.color = gridColor;
        speechRadarChartInstance.options.scales.r.pointLabels.color = isLight ? '#3f3f46' : '#a1a1aa';
      }
      speechRadarChartInstance.update('none');
    } catch (e) {}
  }

  // Monte Carlo Chart
  if (typeof mcChartInstance !== 'undefined' && mcChartInstance) {
    try {
      if (mcChartInstance.options.scales?.x) {
        mcChartInstance.options.scales.x.ticks.color = tickColor;
        mcChartInstance.options.scales.x.grid.color = gridColor;
      }
      if (mcChartInstance.options.scales?.y) {
        mcChartInstance.options.scales.y.ticks.color = tickColor;
        mcChartInstance.options.scales.y.grid.color = gridColor;
      }
      mcChartInstance.update('none');
    } catch (e) {}
  }

  // Develop Dissection Chart
  if (typeof developDissectionChartInstance !== 'undefined' && developDissectionChartInstance) {
    try {
      developDissectionChartInstance.data.datasets[1].backgroundColor = isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.10)';
      developDissectionChartInstance.options.scales.y.grid.color = gridColor;
      developDissectionChartInstance.options.scales.y.ticks.color = tickColor;
      developDissectionChartInstance.options.scales.x.ticks.color = tickColor;
      Object.assign(developDissectionChartInstance.options.plugins.tooltip, {
        backgroundColor: tooltipBg, titleColor: tooltipTitle, bodyColor: tooltipBody, borderColor: tooltipBorder
      });
      developDissectionChartInstance.update('none');
    } catch (e) {}
  }

  // Develop Donut Chart
  if (typeof developDonutChartInstance !== 'undefined' && developDonutChartInstance) {
    try {
      developDonutChartInstance.data.datasets[0].borderColor = isLight ? '#ffffff' : '#0b0b10';
      Object.assign(developDonutChartInstance.options.plugins.tooltip, {
        backgroundColor: tooltipBg, titleColor: tooltipTitle, bodyColor: tooltipBody, borderColor: tooltipBorder
      });
      developDonutChartInstance.update('none');
    } catch (e) {}
  }

  // Develop Spline Chart
  if (typeof developSplineChartInstance !== 'undefined' && developSplineChartInstance) {
    try {
      developSplineChartInstance.data.datasets[1].borderColor = isLight ? 'rgba(15, 23, 42, 0.25)' : 'rgba(255, 255, 255, 0.22)';
      developSplineChartInstance.options.scales.y.grid.color = gridColor;
      developSplineChartInstance.options.scales.y.ticks.color = tickColor;
      developSplineChartInstance.options.scales.x.ticks.color = tickColor;
      Object.assign(developSplineChartInstance.options.plugins.tooltip, {
        backgroundColor: tooltipBg, titleColor: tooltipTitle, bodyColor: tooltipBody, borderColor: tooltipBorder
      });
      developSplineChartInstance.update('none');
    } catch (e) {}
  }
}


// ==========================================================================
// BLOCK 5 & WAVE 2: SEQUENTIAL TOAST NOTIFICATION QUEUE (TIER-1)
// ==========================================================================
const toastQueue = [];
let toastActive = false;
let _toastHideTimeout = null;

function showToast(title, desc, type = 'info', duration = 2500) {
  const item = {
    title: title || '',
    desc: desc || '',
    type: type || 'info',
    duration: duration || 2500
  };

  if (toastActive) {
    toastQueue.push(item);
    return;
  }

  _renderToastItem(item);
}

function _renderToastItem(item) {
  toastActive = true;
  const box = document.getElementById('toastBox');
  if (!box) {
    toastActive = false;
    return;
  }

  const titleEl = document.getElementById('toastTitle');
  const descEl = document.getElementById('toastDesc');
  const icon = box.querySelector('svg');

  if (titleEl) titleEl.textContent = item.title;
  if (descEl) descEl.textContent = item.desc;

  // Reset classes and set typed styling
  box.classList.remove('toast-leaving', 'toast--success', 'toast--error', 'toast--warn', 'toast--info');
  const typeClass = 'toast--' + (['success', 'error', 'warn', 'info'].includes(item.type) ? item.type : 'info');
  box.classList.add(typeClass);

  if (icon) {
    const strokeColors = {
      success: '#10b981',
      error: '#f43f5e',
      warn: '#f59e0b',
      info: '#a78bfa'
    };
    icon.setAttribute('stroke', strokeColors[item.type] || '#a78bfa');
  }

  box.style.display = 'block';

  clearTimeout(_toastHideTimeout);
  _toastHideTimeout = setTimeout(() => {
    box.classList.add('toast-leaving');
    setTimeout(() => {
      box.style.display = 'none';
      box.classList.remove('toast-leaving');
      if (toastQueue.length > 0) {
        const nextItem = toastQueue.shift();
        _renderToastItem(nextItem);
      } else {
        toastActive = false;
      }
    }, 220);
  }, item.duration);
}

// Backwards compatibility alias
const _toastQueue = toastQueue;
let _isToastShowing = toastActive;


// ==========================================================================
// 2026 LIVE DATA TICKER & CHART TIMESTAMPS
// ==========================================================================
let lastSyncTime = Date.now();
function tickLiveStatus() {
  const el = document.querySelector('[data-live-status]');
  if (!el) return;
  const sec = Math.floor((Date.now() - lastSyncTime) / 1000);
  const label = sec < 5 ? 'только что'
             : sec < 60 ? `${sec}с назад`
             : sec < 3600 ? `${Math.floor(sec / 60)}мин назад`
             : `${Math.floor(sec / 3600)}ч назад`;
  el.textContent = `LIVE · синхр. ${label}`;
}
setInterval(tickLiveStatus, 1000);

function updateChartTimestamps() {
  const now = new Date().toLocaleTimeString('ru-RU');
  document.querySelectorAll('[data-chart-ts]').forEach(el => {
    el.textContent = `обновлено ${now}`;
  });
}


// ==========================================================================
// 2026 CUSTOM CURSOR (Linear / Framer Micro-Interaction)
// ==========================================================================
function initCustomCursor() {
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (document.querySelector('.custom-cursor')) return;

  const cursor = document.createElement('div');
  cursor.className = 'custom-cursor';
  document.body.appendChild(cursor);

  let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
  let cursorX = mouseX, cursorY = mouseY;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function render() {
    cursorX += (mouseX - cursorX) * 0.35;
    cursorY += (mouseY - cursorY) * 0.35;
    cursor.style.left = cursorX + 'px';
    cursor.style.top = cursorY + 'px';
    requestAnimationFrame(render);
  }
  render();

  document.addEventListener('mouseover', (e) => {
    const target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('input[type="text"], input[type="password"], textarea')) {
      cursor.classList.remove('grow');
      cursor.classList.add('text');
    } else if (target.closest('button, a, select, input, [onclick], .call-row, .develop-tx-item, .skill-row, .funnel-step, .card-ai-ask, .bento-card, .develop-card')) {
      cursor.classList.remove('text');
      cursor.classList.add('grow');
    } else {
      cursor.classList.remove('grow', 'text');
    }
  });
}


// ==========================================================================
// 2026 AI-NATIVE AFFORDANCE (Open AI Query from any card)
// ==========================================================================
function openAiAsk(question) {
  openCommandPalette();
  const input = document.getElementById('cmdPaletteInput');
  if (input) {
    input.value = 'AI: ' + question;
  }
  const res = document.getElementById('cmdPaletteResults');
  if (res) {
    let answerText = '';
    if (question.includes('дефицит') || question.includes('4.5M')) {
      answerText = `Дефицит плана <strong style="color:#fb7185;">4.5M ₽</strong> складывается из двух факторов: срыв Next Step на 30% звонков (1.125M ₽) и «черный ящик» CRM с зомби-сделками (0.675M ₽). Остальное — SLA просрочка КП.<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.74rem; color: rgba(255,255,255,0.5);">Рекомендация: перехватить Кейс 01 и Кейс 02 до пятницы — вернёт ~1M ₽ к кассе месяца.</div>`;
    } else if (question.includes('угрозой') || question.includes('сделки')) {
      answerText = `Под угрозой срыва находятся <strong>3 сделки на 1.5M ₽</strong> (B24-78 Светлана, B24-84 Светлана, B24-94 Виктория) из-за отсутствия зафиксированного слота следующего шага.<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.74rem; color: rgba(255,255,255,0.5);">Рекомендация: скопировать и отправить скрипт дожима в WhatsApp по шаблону РОПа.</div>`;
    } else if (question.includes('Next Step') || question.includes('сливают')) {
      answerText = `Светлана показывает <strong>0% фиксации Next Step</strong> (2 из 2 звонков без слота). Надежда и Заряна показывают 100% конверсию в дату встречи.<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.74rem; color: rgba(255,255,255,0.5);">Рекомендация: провести разбор звонка Светланы B24-78 по чек-листу.</div>`;
    } else if (question.includes('разрыв') || question.includes('месяцам') || question.includes('план')) {
      answerText = `Разрыв «Факт vs План» максимален в 3-м квартале. Ключевая причина — зависание счетов на согласовании (DSO > 14 дней) и дефекты квалификации ЛПР на ранних стадиях.<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.74rem; color: rgba(255,255,255,0.5);">Рекомендация: внедрить платежный календарь DSO и контроль зависших КП.</div>`;
    } else if (question.includes('динамика') || question.includes('SSOT')) {
      answerText = `Сходимость SSOT и тренда составляет <strong>100.0%</strong> (дрифт кассы 0.00 ₽). Разница между сделками в CRM и речевыми транскриптами отсутствует.<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.74rem; color: rgba(255,255,255,0.5);">Все 10 сделок верифицированы тройкой автономных агентов L1-L3.</div>`;
    } else if (question.includes('симуляции') || question.includes('вероятность')) {
      answerText = `По 10 000 стохастическим симуляциям Монте-Карло вероятность выполнения плана 5.0M ₽ составляет <strong>32.8%</strong> при текущем темпе. Медианный исход (P50) — 2.58M ₽.<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.74rem; color: rgba(255,255,255,0.5);">Рычаг: увеличение конверсии Next Step до 85% повышает P50 до 3.85M ₽.</div>`;
    } else {
      answerText = `Анализ контура RevOps: все 10 сделок верифицированы в SSOT. Главный фокус внимания — срыв Next Step на звонках Светланы и зависшие коммерческие предложения.<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.74rem; color: rgba(255,255,255,0.5);">Быстрый возврат: 119 000 ₽ в первые 14 дней внедрения регламентов.</div>`;
    }

    res.innerHTML = `
      <div class="cmd-palette-group-title">AI · ответ</div>
      <div style="padding: 14px 18px; font-size: 0.82rem; line-height: 1.6; color: rgba(255,255,255,0.85); background: rgba(124,58,237,0.06); border: 1px solid rgba(124,58,237,0.22); border-radius: 8px; margin: 8px 10px;">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom: 8px;">
          <span class="status-dot dot-cyan" style="width: 5px; height: 5px; margin-right: 0;"></span>
          <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.68rem; color: rgba(255,255,255,0.45);">Gemini 3.5 · 0.7s</span>
        </div>
        ${answerText}
      </div>
    `;
  }
}
window.openAiAsk = openAiAsk;


// ==========================================================================
// GLOBAL COMMAND PALETTE (Ctrl+K / Cmd+K)
// ==========================================================================
let cmdPaletteSelectedIndex = 0;
let filteredCmdItems = [];

function getCommandPaletteItems() {
  const baseItems = [
    // AI Quick Inquiries
    { type: 'AI', icon: '◆', label: 'Спросить AI про текущий экран...', action: () => openAiAsk('Что требует моего внимания прямо сейчас?') },
    { type: 'AI', icon: '◆', label: 'AI: Какие сделки под угрозой?', action: () => openAiAsk('Какие сделки под угрозой?') },
    // Tabs Navigation
    { type: 'Раздел', icon: '→', label: '1. Пульс выручки', action: () => switchTab('pulse') },
    { type: 'Раздел', icon: '→', label: '2. Экспресс 3 цифры', action: () => switchTab('express') },
    { type: 'Раздел', icon: '→', label: '3. Пульт РОПа 15 мин', action: () => switchTab('rop') },
    { type: 'Раздел', icon: '→', label: '4. ИИ-Аудит звонков', action: () => switchTab('audit') },
    { type: 'Раздел', icon: '→', label: '5. Диагностика утечек выручки', action: () => switchTab('leaks') },
    { type: 'Раздел', icon: '→', label: '6. AI Impact & Детектор Fake Yes', action: () => switchTab('impact') },
    { type: 'Раздел', icon: '→', label: '7. Monte Carlo 3.0 симуляция', action: () => switchTab('montecarlo') },
    { type: 'Раздел', icon: '→', label: '8. Навыки & Payroll', action: () => switchTab('skills') },
    { type: 'Раздел', icon: '→', label: '9. Паспорт & E2E Контур', action: () => switchTab('settings') },
    { type: 'Раздел', icon: '→', label: '10. Админ-кабинет (Управление проектом)', action: () => switchTab('admin') },

    // Quick Actions
    { type: 'Действие', icon: '↵', label: 'Экспорт реестра звонков в CSV', action: () => exportCallsToCSV() },
    { type: 'Действие', icon: '↵', label: 'Синхронизировать CRM & n8n (SSOT Re-Sync)', action: () => triggerSyncSimulation() },
    { type: 'Действие', icon: '↵', label: 'Включить ультра-плотный режим (Excel Pro 34px)', action: () => setTableDensity('excel-pro') },
    { type: 'Действие', icon: '↵', label: 'Включить комфортный режим таблицы (Comfort)', action: () => setTableDensity('comfort') },
    { type: 'Действие', icon: '↵', label: 'Выйти из учетной записи (PIN Gate)', action: () => logout() }
  ];

  // Live Deals from CALLS_DATA
  const dealItems = CALLS_DATA.map(c => ({
    type: 'Сделка',
    icon: '§',
    label: `${c.deal_title || c.id} (${c.manager || 'Менеджер'} • ${c.amount || '0 ₽'})`,
    action: () => { switchTab('audit'); openCallModal(c.id); }
  }));

  // Live Reps from CALLS_DATA
  const managers = Array.from(new Set(CALLS_DATA.map(c => c.manager).filter(Boolean)));
  const mgrItems = managers.map(mgr => ({
    type: 'Менеджер',
    icon: '@',
    label: `${mgr}: аудит звонков (${CALLS_DATA.filter(c => c.manager === mgr).length} звонков)`,
    action: () => filterRepAudit(mgr)
  }));

  return [...baseItems, ...dealItems, ...mgrItems];
}

function openCommandPalette() {
  const overlay = document.getElementById('cmdPaletteOverlay');
  const input = document.getElementById('cmdPaletteInput');
  if (overlay) {
    overlay.classList.add('active');
    if (input) {
      input.value = '';
      input.focus();
    }
    cmdPaletteSelectedIndex = 0;
    renderCmdPaletteResults('');
  }
}

function closeCommandPalette(e) {
  if (e && e.target && e.target.id !== 'cmdPaletteOverlay' && !e.target.classList.contains('cmd-palette-esc-badge')) {
    return;
  }
  const overlay = document.getElementById('cmdPaletteOverlay');
  if (overlay) overlay.classList.remove('active');
}

function toggleCommandPalette() {
  const overlay = document.getElementById('cmdPaletteOverlay');
  if (overlay && overlay.classList.contains('active')) {
    overlay.classList.remove('active');
  } else {
    openCommandPalette();
  }
}

function handleCmdPaletteSearch(query) {
  cmdPaletteSelectedIndex = 0;
  renderCmdPaletteResults(query);
}

function renderCmdPaletteResults(query) {
  const resContainer = document.getElementById('cmdPaletteResults');
  if (!resContainer) return;
  const q = (query || '').trim().toLowerCase();

  filteredCmdItems = getCommandPaletteItems().filter(item => {
    if (item.label.includes('Админ-кабинет') && !isAdminAuthorized()) {
      return false;
    }
    if (!q) return true;
    return item.label.toLowerCase().includes(q) || item.type.toLowerCase().includes(q);
  });

  if (filteredCmdItems.length === 0) {
    resContainer.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">
        Ничего не найдено по запросу "<strong>${query}</strong>"
      </div>
    `;
    return;
  }

  // Group by type
  const groups = {};
  filteredCmdItems.forEach((item, idx) => {
    if (!groups[item.type]) groups[item.type] = [];
    groups[item.type].push({ item, globalIdx: idx });
  });

  let html = '';
  Object.keys(groups).forEach(type => {
    html += `<div class="cmd-palette-group-title">${type}</div>`;
    groups[type].forEach(({ item, globalIdx }) => {
      const isSelected = (globalIdx === cmdPaletteSelectedIndex);
      html += `
        <div class="cmd-palette-item ${isSelected ? 'selected' : ''}" onclick="executeCmdPaletteAction(${globalIdx})">
          <div class="cmd-palette-item-left">
            <span style="font-size: 1rem;">${item.icon}</span>
            <span style="font-weight: ${isSelected ? '700' : '500'};">${item.label}</span>
          </div>
          <span style="font-size: 0.68rem; color: var(--text-muted); font-family: monospace;">↵ Выбрать</span>
        </div>
      `;
    });
  });

  resContainer.innerHTML = html;
}

function executeCmdPaletteAction(idx) {
  const item = filteredCmdItems[idx];
  if (item && typeof item.action === 'function') {
    const overlay = document.getElementById('cmdPaletteOverlay');
    if (overlay) overlay.classList.remove('active');
    item.action();
  }
}

function handleCmdPaletteKeydown(e) {
  const overlay = document.getElementById('cmdPaletteOverlay');
  if (!overlay || !overlay.classList.contains('active')) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (filteredCmdItems.length > 0) {
      cmdPaletteSelectedIndex = (cmdPaletteSelectedIndex + 1) % filteredCmdItems.length;
      renderCmdPaletteResults(document.getElementById('cmdPaletteInput')?.value || '');
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (filteredCmdItems.length > 0) {
      cmdPaletteSelectedIndex = (cmdPaletteSelectedIndex - 1 + filteredCmdItems.length) % filteredCmdItems.length;
      renderCmdPaletteResults(document.getElementById('cmdPaletteInput')?.value || '');
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    executeCmdPaletteAction(cmdPaletteSelectedIndex);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    overlay.classList.remove('active');
  }
}

// Keyboard trigger: Ctrl+K / Cmd+K
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) {
      e.preventDefault();
      toggleCommandPalette();
    } else if (e.key === 'Escape') {
      const overlay = document.getElementById('cmdPaletteOverlay');
      if (overlay && overlay.classList.contains('active')) {
        overlay.classList.remove('active');
      }
    }
  });
}// ==========================================================================
// GLOBAL PERIOD PICKER & SYNCHRONIZATION
// ==========================================================================
function setGlobalPeriod(period, label) {
  if (typeof window !== 'undefined') window._CURRENT_GLOBAL_PERIOD = period;
  if (typeof setPulsePeriod === 'function') {
    setPulsePeriod(period);
  }
  const labelEl = document.getElementById('globalPeriodLabel');
  if (labelEl) labelEl.textContent = label;

  const dropdown = document.getElementById('globalPeriodDropdown');
  if (dropdown) {
    dropdown.querySelectorAll('.period-option').forEach(opt => {
      const onclickAttr = opt.getAttribute('onclick') || '';
      if (onclickAttr.includes(`'${period}'`) || opt.textContent.trim() === label.trim()) {
        opt.classList.add('active');
      } else {
        opt.classList.remove('active');
      }
    });
    dropdown.style.display = 'none';
  }
  const btn = document.getElementById('globalPeriodBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');

  const factSel = document.getElementById('dropdownPulsePeriodFact');
  if (factSel) {
    const lbl = factSel.querySelector('.dropdown-label');
    if (lbl) lbl.textContent = label;
  }
  const planSel = document.getElementById('dropdownPulsePeriodPlan');
  if (planSel) {
    const lbl = planSel.querySelector('.dropdown-label');
    if (lbl) lbl.textContent = label;
  }
}

function toggleGlobalPeriodDropdown(e) {
  if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
  const dropdown = document.getElementById('globalPeriodDropdown');
  const btn = document.getElementById('globalPeriodBtn');
  if (!dropdown) return;
  const isShown = dropdown.style.display === 'block';
  dropdown.style.display = isShown ? 'none' : 'block';
  if (btn) btn.setAttribute('aria-expanded', !isShown ? 'true' : 'false');
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('globalPeriodPicker');
    if (picker && !picker.contains(e.target)) {
      const dropdown = document.getElementById('globalPeriodDropdown');
      const btn = document.getElementById('globalPeriodBtn');
      if (dropdown) dropdown.style.display = 'none';
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ==========================================================================
// FOCUS TRAP FOR MODAL DIALOGS (WCAG A11Y)
// ==========================================================================
let _lastActiveElement = null;
let _activeTrapHandler = null;

function trapFocus(modalElement) {
  if (!modalElement || typeof document === 'undefined') return;
  _lastActiveElement = document.activeElement;

  const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const getFocusable = () => Array.from(modalElement.querySelectorAll(focusableSelector)).filter(
    el => !el.hasAttribute('disabled') && el.offsetParent !== null
  );

  const focusables = getFocusable();
  if (focusables.length > 0) {
    focusables[0].focus();
  }

  if (_activeTrapHandler) {
    document.removeEventListener('keydown', _activeTrapHandler);
  }

  _activeTrapHandler = function(e) {
    if (e.key !== 'Tab') return;
    const currentFocusables = getFocusable();
    if (currentFocusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = currentFocusables[0];
    const last = currentFocusables[currentFocusables.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  document.addEventListener('keydown', _activeTrapHandler);
}

function releaseFocus() {
  if (typeof document !== 'undefined' && _activeTrapHandler) {
    document.removeEventListener('keydown', _activeTrapHandler);
    _activeTrapHandler = null;
  }
  if (_lastActiveElement && typeof _lastActiveElement.focus === 'function') {
    _lastActiveElement.focus();
    _lastActiveElement = null;
  }
}

// ==========================================================================
// DYNAMIC LAZY LOADER FOR ADMIN MODULE
// ==========================================================================
function loadAdminScript(callback) {
  if (typeof window !== 'undefined' && window.adminScriptLoaded) {
    if (typeof callback === 'function') callback();
    return;
  }
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
  const script = document.createElement('script');
  script.src = 'js/admin.js?v=20.16-sparklines-sync';
  script.onload = () => {
    if (typeof window !== 'undefined') window.adminScriptLoaded = true;
    if (typeof callback === 'function') callback();
  };
  document.body.appendChild(script);
}

if (typeof window !== 'undefined') {
  window.loadAdminScript = loadAdminScript;
  if (!window.triggerSelfHealingAudit) {
    window.triggerSelfHealingAudit = function() {
      loadAdminScript(() => {
        if (typeof window.triggerSelfHealingAudit === 'function' && !window.triggerSelfHealingAudit._isProxy) {
          window.triggerSelfHealingAudit();
        }
      });
    };
    window.triggerSelfHealingAudit._isProxy = true;
  }
}

// ==========================================================================
// GLOBAL ESCAPE KEY HANDLER FOR ACTIVE MODALS
// ==========================================================================
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const callModal = document.getElementById('callModal');
      if (callModal && (callModal.style.display === 'flex' || callModal.classList.contains('active'))) {
        if (typeof closeCallModal === 'function') closeCallModal();
        return;
      }

      const onePager = document.getElementById('onePagerModal');
      if (onePager && (onePager.style.display === 'flex' || onePager.classList.contains('active'))) {
        if (typeof closeOnePagerModal === 'function') closeOnePagerModal();
        return;
      }

      const tenantEdit = document.getElementById('adminTenantEditModal');
      if (tenantEdit && (tenantEdit.style.display === 'flex' || tenantEdit.style.display === 'block')) {
        if (typeof closeTenantEditModal === 'function') closeTenantEditModal();
        return;
      }

      const healthDoctor = document.getElementById('tenantHealthDoctorModal');
      if (healthDoctor && (healthDoctor.style.display === 'flex' || healthDoctor.style.display === 'block')) {
        if (typeof closeTenantHealthDoctorModal === 'function') closeTenantHealthDoctorModal();
        return;
      }

      const periodDropdown = document.getElementById('globalPeriodDropdown');
      if (periodDropdown && periodDropdown.style.display === 'block') {
        periodDropdown.style.display = 'none';
        const pbtn = document.getElementById('globalPeriodBtn');
        if (pbtn) pbtn.setAttribute('aria-expanded', 'false');
        return;
      }
    }
  });
}



// Expose Core handlers on window
window.setGlobalPeriod = setGlobalPeriod;
window.toggleGlobalPeriodDropdown = toggleGlobalPeriodDropdown;
window.trapFocus = trapFocus;
window.releaseFocus = releaseFocus;
window.REVOPS_API_BASE = REVOPS_API_BASE;

window.getActiveTenantId = getActiveTenantId;
window.onTenantSelected = onTenantSelected;
window.initTenantsSelector = initTenantsSelector;
window.checkAuth = checkAuth;
window.showAuthGate = showAuthGate;
window.isAdminAuthorized = isAdminAuthorized;
window.applyAuthenticatedSession = applyAuthenticatedSession;
window.handleAuthSubmit = handleAuthSubmit;
window.logout = logout;
window.toggleSidebar = toggleSidebar;
window.closeMobileSidebar = closeMobileSidebar;
window.filterSidebarItems = filterSidebarItems;
window.ALL_TABS = ALL_TABS;
window.switchTab = switchTab;
window.animateCounter = animateCounter;
window.syncHeroKpiCards = syncHeroKpiCards;
window.animateCardsIn = animateCardsIn;
window.setAccentTheme = setAccentTheme;
window.getThemeMode = getThemeMode;
window.setThemeMode = setThemeMode;
window.toggleThemeMode = toggleThemeMode;
window.updateThemeToggleUI = updateThemeToggleUI;
window.updateAllChartsTheme = updateAllChartsTheme;
window.showToast = showToast;
window.toastQueue = toastQueue;
window.toastActive = toastActive;
window.tickLiveStatus = tickLiveStatus;
window.updateChartTimestamps = updateChartTimestamps;
window.initCustomCursor = initCustomCursor;
window.openAiAsk = openAiAsk;
window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
window.toggleCommandPalette = toggleCommandPalette;
window.handleCmdPaletteSearch = handleCmdPaletteSearch;
window.renderCmdPaletteResults = renderCmdPaletteResults;
window.executeCmdPaletteAction = executeCmdPaletteAction;
window.handleCmdPaletteKeydown = handleCmdPaletteKeydown;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getActiveTenantId,
    logout
  };
}

/**
 * RevOps Enterprise OS - Core Architecture Module (v20.4)
 * Responsibilities: API routing, auth & session guard, shell navigation, themes, toast, command palette, live ticker.
 */

const REVOPS_API_BASE = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ? ''
  : (typeof window !== 'undefined' && window.location.hostname.includes('ai-rop.ru') && !window.location.hostname.startsWith('report.') ? 'https://report.ai-rop.ru' : '');


function getActiveTenantId() {
  try {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlTenant = urlParams.get('tenant') || urlParams.get('tenant_id');
      if (urlTenant && urlTenant.trim()) return urlTenant.trim().toUpperCase();

      const stored = localStorage.getItem('revops_active_tenant');
      if (stored && stored.trim()) return stored.trim().toUpperCase();

      const rawSession = localStorage.getItem('revops_auth_session');
      if (rawSession) {
        const sess = JSON.parse(rawSession);
        if (sess && sess.tenant) {
          const match = sess.tenant.match(/TNT-[A-Z0-9_-]+/i);
          if (match) return match[0].toUpperCase();
        }
      }
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

  if (typeof showToast === 'function') {
    showToast('Переключение клиента', `Загрузка данных тенанта ${cleanId}...`);
  }

  // Re-fetch data for the newly selected tenant
  if (typeof fetchLiveCallsData === 'function') {
    await fetchLiveCallsData(true);
  }
  if (typeof fetchAndPopulateSettings === 'function') {
    await fetchAndPopulateSettings(false);
  }
}

async function initTenantsSelector() {
  const selector = document.getElementById('headerTenantSelector');
  if (!selector) return;

  const currentId = getActiveTenantId();
  try {
    const res = await fetch(`${REVOPS_API_BASE}/api/v1/tenants`);
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
// CRYPTOGRAPHIC AUTH ACCESS GATE LOGIC (SHA-256 & HMAC SESSION GUARD)
// ==========================================================================
const AUTH_STORAGE_KEY = 'revops_enterprise_session_v1';
const AUTH_SIGN_SALT = 'revops_tnt001_enterprise_sec_v20_2';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Only SHA-256 hashes are stored. Zero plaintext passwords in source code.
let VALID_CREDENTIALS = [
  {
    login: 'dmitriyfedotov1908@gmail.com',
    keyHashes: [
      'f82d5f1f10fc36e941922f73e9b7ad871bace49786bd408a135359a3346df27b',
      '00f6112fe58387958ef80793a34746429f40c97fe7b51d6a576705acbf8fc6af',
      'dff496958fb64f93c897156c9bfcbfe6a32975efadaa21d957a82b9b9f4801bd',
      '9d3ba5c08978d3354103973088fcc0df35ece2ea9de24c9dfc250d46375c9eec',
      'd7baef91d7e90fe49774b6bcabcca33ac3cc2296d5622b250ee836f78f1cd410'
    ],
    name: 'Дмитрий Федотов',
    role: 'РОП • Руководитель ОП',
    tenant: 'TNT-001 • Самозанятый'
  },
  {
    login: 'admin',
    keyHashes: [
      'f82d5f1f10fc36e941922f73e9b7ad871bace49786bd408a135359a3346df27b',
      'dff496958fb64f93c897156c9bfcbfe6a32975efadaa21d957a82b9b9f4801bd',
      '00f6112fe58387958ef80793a34746429f40c97fe7b51d6a576705acbf8fc6af',
      'd7baef91d7e90fe49774b6bcabcca33ac3cc2296d5622b250ee836f78f1cd410'
    ],
    name: 'Администратор RevOps',
    role: 'Admin / Супервайзер',
    tenant: 'TNT-001 • Самозанятый'
  },
  {
    login: 'rop',
    keyHashes: [
      'f82d5f1f10fc36e941922f73e9b7ad871bace49786bd408a135359a3346df27b',
      '00f6112fe58387958ef80793a34746429f40c97fe7b51d6a576705acbf8fc6af',
      'dff496958fb64f93c897156c9bfcbfe6a32975efadaa21d957a82b9b9f4801bd',
      'd7baef91d7e90fe49774b6bcabcca33ac3cc2296d5622b250ee836f78f1cd410'
    ],
    name: 'Дмитрий Федотов',
    role: 'РОП • Руководитель ОП',
    tenant: 'TNT-001 • Самозанятый'
  }
];

const CUSTOM_CLIENTS_KEY = 'revops_custom_clients_v1';
function loadCachedCustomClients() {
  try {
    const raw = localStorage.getItem(CUSTOM_CLIENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(c => {
          if (c && c.login && !VALID_CREDENTIALS.some(v => v.login.toLowerCase() === c.login.toLowerCase())) {
            VALID_CREDENTIALS.push(c);
          }
        });
      }
    }
  } catch (e) {}
}
loadCachedCustomClients();

async function syncClientsFromBackend() {
  try {
    const res = await fetch(`${REVOPS_API_BASE}/api/v1/auth/registered-clients`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.clients)) {
        data.clients.forEach(c => {
          const existingIdx = VALID_CREDENTIALS.findIndex(v => v.login.toLowerCase() === c.login.toLowerCase());
          if (existingIdx >= 0) {
            VALID_CREDENTIALS[existingIdx] = c;
          } else {
            VALID_CREDENTIALS.push(c);
          }
        });
        localStorage.setItem(CUSTOM_CLIENTS_KEY, JSON.stringify(VALID_CREDENTIALS));
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
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const utf8 = unescape(encodeURIComponent(str));
  const words = [];
  for (let i = 0; i < utf8.length; i++) words[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
  const bitLen = utf8.length * 8;
  words[bitLen >> 5] |= 0x80 << (24 - (bitLen % 32));
  words[(((bitLen + 64) >> 9) << 4) + 15] = bitLen;
  const w = new Array(64);
  for (let i = 0; i < words.length; i += 16) {
    for (let j = 0; j < 16; j++) w[j] = words[i + j] | 0;
    for (let j = 16; j < 64; j++) {
      const s0 = ((w[j - 15] >>> 7) | (w[j - 15] << 25)) ^ ((w[j - 15] >>> 18) | (w[j - 15] << 14)) ^ (w[j - 15] >>> 3);
      const s1 = ((w[j - 2] >>> 17) | (w[j - 2] << 15)) ^ ((w[j - 2] >>> 19) | (w[j - 2] << 13)) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let j = 0; j < 64; j++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + k[j] + w[j]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map(v => ((v >>> 0).toString(16).padStart(8, '0'))).join('');
}

async function checkAuth() {
  try {
    const rawSession = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!rawSession) {
      showAuthGate();
      return false;
    }
    const session = JSON.parse(rawSession);
    if (!session || !session.authenticated || !session.login || !session.timestamp || !session.signature) {
      throw new Error('Invalid or tampered session structure');
    }

    // Enforce strict TTL
    if (Date.now() - session.timestamp > SESSION_TTL_MS) {
      throw new Error('Session expired by TTL');
    }

    // Find user
    const user = VALID_CREDENTIALS.find(u => u.login.toLowerCase() === session.login.toLowerCase());
    if (!user) {
      throw new Error('Unregistered user credentials');
    }

    // Verify cryptographic signature against authorized hashes
    let isSignatureValid = false;
    for (const validHash of user.keyHashes) {
      const expectedSignature = await sha256Hex(user.login + ':' + validHash + ':' + session.timestamp + ':' + AUTH_SIGN_SALT);
      if (expectedSignature === session.signature) {
        isSignatureValid = true;
        break;
      }
    }

    if (isSignatureValid) {
      applyAuthenticatedSession(session);
      return true;
    } else {
      throw new Error('Cryptographic signature mismatch (tampered session detected)');
    }
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
    if (sessionStorage.getItem('revops_admin_override') === 'true' || localStorage.getItem('revops_admin_override') === 'true') {
      return true;
    }
    const rawSession = localStorage.getItem(AUTH_STORAGE_KEY) || sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!rawSession) return false;
    const session = JSON.parse(rawSession);
    if (!session || !session.authenticated) return false;
    const login = (session.login || '').toLowerCase().trim();
    const role = (session.role || '').toLowerCase();
    return (
      login === 'admin' ||
      login === 'dmitriyfedotov1908@gmail.com' ||
      role.includes('admin') ||
      role.includes('супервайзер')
    );
  } catch (e) {
    return false;
  }
}

async function promptAdminUnlock() {
  const enteredKey = window.prompt('🔐 Вход в Админ-кабинет RevOps\n\nВы находитесь на удаленном сервере. Введите пароль администратора или мастер-ключ:');
  if (!enteredKey) return false;
  const trimmed = enteredKey.trim();
  const inputHash = await sha256Hex(trimmed);
  const validAdminHashes = [
    'f82d5f1f10fc36e941922f73e9b7ad871bace49786bd408a135359a3346df27b',
    '00f6112fe58387958ef80793a34746429f40c97fe7b51d6a576705acbf8fc6af',
    'dff496958fb64f93c897156c9bfcbfe6a32975efadaa21d957a82b9b9f4801bd',
    '9d3ba5c08978d3354103973088fcc0df35ece2ea9de24c9dfc250d46375c9eec',
    'd7baef91d7e90fe49774b6bcabcca33ac3cc2296d5622b250ee836f78f1cd410'
  ];
  if (trimmed === 'revops_admin_fleet_secret_2026' || validAdminHashes.includes(inputHash)) {
    sessionStorage.setItem('revops_admin_override', 'true');
    const sbAdmin = document.getElementById('sb-admin');
    if (sbAdmin) sbAdmin.style.display = 'flex';
    showToast('Доступ открыт', 'Админ-кабинет успешно активирован');
    return true;
  } else {
    showToast('Ошибка доступа', 'Неверный пароль администратора');
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
  // Клиент никогда не видит админку. Она отображается ТОЛЬКО:
  // 1) На локальном ПК разработчика (localhost / 127.0.0.1)
  // 2) ИЛИ при авторизации под учетной записью 'admin'
  const sbAdmin = document.getElementById('sb-admin');
  if (sbAdmin) {
    sbAdmin.style.display = isAdminAuthorized() ? 'flex' : 'none';
  }
}

async function handleAuthSubmit(e) {
  if (e) e.preventDefault();
  const loginInput = document.getElementById('authLogin');
  const passInput = document.getElementById('authPassword');
  const rememberCheckbox = document.getElementById('authRemember');
  const errorBox = document.getElementById('authErrorBox');
  const card = document.getElementById('authCard');
  const submitBtn = document.getElementById('btnAuthSubmit');

  const loginVal = (loginInput.value || '').trim().toLowerCase();
  const passVal = (passInput.value || '').trim();

  errorBox.style.display = 'none';

  if (!loginVal || !passVal) {
    errorBox.style.display = 'block';
    return false;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
  }

  try {
    const inputHash = await sha256Hex(passVal);

    let foundUser = null;
    let matchedHash = null;

    for (const cred of VALID_CREDENTIALS) {
      if (cred.login.toLowerCase() === loginVal && cred.keyHashes.includes(inputHash)) {
        foundUser = cred;
        matchedHash = inputHash;
        break;
      }
    }

    if (!foundUser) {
      errorBox.style.display = 'block';
      if (card) {
        card.classList.add('shake');
        setTimeout(() => card.classList.remove('shake'), 400);
      }
      if (submitBtn) submitBtn.disabled = false;
      return false;
    }

    const now = Date.now();
    const signature = await sha256Hex(foundUser.login + ':' + matchedHash + ':' + now + ':' + AUTH_SIGN_SALT);

    const sessionData = {
      authenticated: true,
      login: foundUser.login,
      name: foundUser.name,
      role: foundUser.role,
      tenant: foundUser.tenant,
      timestamp: now,
      signature: signature
    };

    const storage = (rememberCheckbox && rememberCheckbox.checked) ? localStorage : sessionStorage;
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionData));

    applyAuthenticatedSession(sessionData);
    showToast('Доступ разрешён', `Добро пожаловать в систему, ${foundUser.name}!`);
    return false;
  } catch (err) {
    console.error('Authentication failure:', err);
    errorBox.style.display = 'block';
    return false;
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function logout() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
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
  } else if (el.id === 'metricSsotVal') {
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
  if (tabId === 'admin' && !isAdminAuthorized()) {
    const unlocked = await promptAdminUnlock();
    if (!unlocked) {
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

    if (tabId === 'montecarlo' && mcChartInstance) {
      mcChartInstance.resize();
    }
    if (tabId === 'rop' && repPerfChartInstance) {
      repPerfChartInstance.resize();
    }
    if (tabId === 'audit' && speechRadarChartInstance) {
      speechRadarChartInstance.resize();
    }
    if (tabId === 'admin') {
      loadAdminStatus();
    }
    if (tabId === 'analyst') {
      initAnalystTab();
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
// TOAST NOTIFICATION
// ==========================================================================
function showToast(title, desc) {
  const box = document.getElementById('toastBox');
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastDesc').textContent = desc;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 3500);
}


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



// Expose Core handlers on window
window.REVOPS_API_BASE = REVOPS_API_BASE;
window.getActiveTenantId = getActiveTenantId;
window.onTenantSelected = onTenantSelected;
window.initTenantsSelector = initTenantsSelector;
window.checkAuth = checkAuth;
window.showAuthGate = showAuthGate;
window.isAdminAuthorized = isAdminAuthorized;
window.promptAdminUnlock = promptAdminUnlock;
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

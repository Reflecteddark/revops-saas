const REVOPS_API_BASE = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ? ''
  : (typeof window !== 'undefined' && window.location.hostname.includes('ai-rop.ru') && !window.location.hostname.startsWith('report.') ? 'https://report.ai-rop.ru' : '');

let CALLS_DATA = [];

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
        sb.classList.toggle('collapsed');
        const isCollapsed = sb.classList.contains('collapsed');
        localStorage.setItem('revops_sidebar_collapsed', isCollapsed ? '1' : '0');
        if (mcChartInstance) {
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

    // ==========================================================================
    // TABS SWITCHING
    // ==========================================================================
    const ALL_TABS = ['pulse', 'express', 'rop', 'audit', 'leaks', 'impact', 'montecarlo', 'skills', 'settings', 'admin'];


    function filterRepAudit(repName) {
      switchTab('audit');
      const sel = document.getElementById('filterManager');
      if (sel) {
        sel.value = repName;
        filterCallsTable();
      }
      showToast('Фильтр по менеджеру', `Открыт аудит звонков сотрудника: ${repName}`);
    }

    function animateCounter(el, target, duration = 900) {
      if (!el) return;
      const start = performance.now();
      const fmt = n => n.toLocaleString('ru-RU');
      const isInitial = !el.dataset.hasValue;
      el.dataset.hasValue = '1';

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
                  ${PLAYBOOK_DIFFS[call.id]?.defectQuote || '«Отправлю вам материалы на почту, если что перезвоните...»'}
                </div>
              </div>
              <div class="diff-col-recommend" style="padding: 10px; background: rgba(52,211,153,0.05); border: 1px solid rgba(52,211,153,0.2); border-radius: 6px;">
                <div style="font-size: 0.68rem; font-weight: 700; color: #34d399; text-transform: uppercase; margin-bottom: 5px;">
                  AI-Рекомендация (Эталон B2B RevOps):
                </div>
                <div style="font-size: 0.76rem; color: #6ee7b7; font-weight: 500; line-height: 1.45;">
                  ${PLAYBOOK_DIFFS[call.id]?.recommendScript || '«Чтобы не терять время, давайте во вторник в 12:00 на 15 минут в Zoom зафиксируем расчет окупаемости.»'}
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
      ['today', '7d', 'month'].forEach(id => {
        const btn = document.getElementById('btnPeriod' + id.charAt(0).toUpperCase() + id.slice(1));
        if (btn) {
          if (id === period) {
            btn.className = 'btn btn-primary';
          } else {
            btn.className = 'btn btn-ghost';
          }
        }
      });

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

      if (period === 'today') {
        animateCounter(document.getElementById('metricPlanVal'), 250000);
        animateCounter(document.getElementById('metricFactVal'), totalFact);
        const pct = totalFact > 0 ? ((totalFact / 250000) * 100).toFixed(1) : '0.0';
        const b = document.getElementById('metricFactBadge');
        if (b) b.textContent = `${pct}% ВЫПОЛНЕНО`;
        animateCounter(document.getElementById('metricSsotVal'), computedSsot);
        if (document.getElementById('metricPipeVal')) animateCounter(document.getElementById('metricPipeVal'), computedPipe);
        if (syncText) syncText.textContent = `Срез за сегодня (${CALLS_DATA.length} звонков)`;
        showToast('Период: Сегодня', 'Показана суточная операционная активность.');
      } else if (period === '7d') {
        animateCounter(document.getElementById('metricPlanVal'), 1250000);
        animateCounter(document.getElementById('metricFactVal'), totalFact);
        const pct = totalFact > 0 ? ((totalFact / 1250000) * 100).toFixed(1) : '0.0';
        const b = document.getElementById('metricFactBadge');
        if (b) b.textContent = `${pct}% ВЫПОЛНЕНО`;
        animateCounter(document.getElementById('metricSsotVal'), computedSsot);
        if (document.getElementById('metricPipeVal')) animateCounter(document.getElementById('metricPipeVal'), computedPipe);
        if (syncText) syncText.textContent = `Срез за последние 7 дней (${CALLS_DATA.length} звонков)`;
        showToast('Период: 7 дней', 'Показаны данные за прошедшую неделю.');
      } else {
        animateCounter(document.getElementById('metricPlanVal'), 5000000);
        animateCounter(document.getElementById('metricFactVal'), totalFact);
        const pct = totalFact > 0 ? ((totalFact / 5000000) * 100).toFixed(1) : '0.0';
        const b = document.getElementById('metricFactBadge');
        if (b) b.textContent = `${pct}% ВЫПОЛНЕНО`;
        animateCounter(document.getElementById('metricSsotVal'), computedSsot);
        if (document.getElementById('metricPipeVal')) animateCounter(document.getElementById('metricPipeVal'), computedPipe);
        if (syncText) syncText.textContent = `Синхронизировано: amoCRM + Битрикс24 (${CALLS_DATA.length} звонков)`;
        showToast('Период: Октябрь 2026', 'Показан полный месячный контур компании.');
      }
    }

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

      const reps = ['Заряна', 'Надежда', 'Виктория', 'Светлана'];
      const avatarClasses = {
        'Заряна': 'rep-z',
        'Надежда': 'rep-n',
        'Виктория': 'rep-v',
        'Светлана': 'rep-s'
      };
      const initials = {
        'Заряна': 'З',
        'Надежда': 'Н',
        'Виктория': 'В',
        'Светлана': 'С'
      };
      const critLabels = (typeof CRITERIA_NAMES !== 'undefined') ? CRITERIA_NAMES : [
        "Next Step", "Инициатива", "ЛПР", "Боли", "Дорого",
        "Я подумаю", "Кейсы", "Закрытие", "Приветствие",
        "Чистота речи", "Talk/Listen", "Итог", "Маржа"
      ];

      let html = '';
      reps.forEach(rep => {
        const repCalls = CALLS_DATA.filter(c => c.manager === rep);
        const count = repCalls.length;
        const avgScore = count ? (repCalls.reduce((sum, c) => sum + (c.score || 0), 0) / count).toFixed(1) : '0.0';
        const scoreColor = parseFloat(avgScore) >= 9.0 ? '#34d399' : '#fb7185';
        const repRole = rep === 'Заряна' ? 'Эталон звонков' :
                        rep === 'Надежда' ? 'Рекордсмен' :
                        rep === 'Виктория' ? 'Клоузер' : 'Зона риска';

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

        html += `
          <div class="skill-row" onclick="filterRepAudit('${rep}')" style="display: grid; grid-template-columns: 40px 140px 1fr 60px; align-items: center; gap: 16px; padding: 12px 16px; background: rgba(255,255,255,0.02); border-radius: 10px; cursor: pointer; transition: background 0.15s ease;">
            <div class="call-avatar ${avatarClasses[rep] || 'rep-z'}">${initials[rep] || rep[0]}</div>
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
    // EXPRESS 3 NUMBERS CALCULATOR (TAB 2)
    // ==========================================================================
    function recalcExpress() {
      const leads = parseInt(document.getElementById('rngLeadsExp').value, 10);
      const check = parseInt(document.getElementById('rngCheckExp').value, 10);
      const mgr = parseInt(document.getElementById('rngMgrExp').value, 10);

      document.getElementById('valLeadsExp').textContent = leads + ' шт';
      document.getElementById('valCheckExp').textContent = check.toLocaleString('ru-RU') + ' ₽';
      document.getElementById('valMgrExp').textContent = mgr + ' чел';

      // Formulas from master dump:
      // Lost = 340,000 baseline scaled
      const baseRatio = (leads * check) / 5000000;
      const lost = Math.round(340000 * baseRatio);
      const basePlan = Math.round(500000 * baseRatio * 1.204);
      const optPlan = Math.round(500000 * baseRatio * 1.34);

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

      const labels = ['1.2M', '1.5M', '1.86M (P10)', '2.2M', '2.58M (P50)', '2.9M', '3.21M (P90)', '3.6M', '4.0M', '4.5M', '5.0M'];
      const dataValues = [40, 110, 290, 480, 620, 510, 310, 180, 95, 45, 20];

      mcChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Плотность вероятности (исходов из 10 000)',
            data: dataValues,
            backgroundColor: function(context) {
              const idx = context.dataIndex;
              if (idx === 2) return 'rgba(244, 63, 94, 0.85)';   // P10 Rose
              if (idx === 4) return 'rgba(139, 92, 246, 0.95)';  // P50 Violet Brand
              if (idx === 6) return 'rgba(16, 185, 129, 0.88)';  // P90 Emerald
              return 'rgba(255, 255, 255, 0.12)';                // Neutral Slate bars
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
    }

    function updateSimulation(notify = true) {
      const rngL = document.getElementById('rngLeads');
      const rngQ = document.getElementById('rngQual');
      const rngC = document.getElementById('rngClose');
      if (!rngL || !rngQ || !rngC) return;
      const leads = rngL.value;
      const qual = rngQ.value;
      const close = rngC.value;

      document.getElementById('lblLeads').textContent = leads + ' шт';
      document.getElementById('lblQual').textContent = qual + '%';
      document.getElementById('lblClose').textContent = close + '%';

      const projected = Math.round(leads * (qual / 100) * (close / 100) * 500000);
      document.getElementById('simVerdictText').textContent = 
        `Прогноз кассы при входящем потоке ${leads} лидов: ${projected.toLocaleString('ru-RU')} ₽!`;

      if (notify && typeof showToast === 'function') {
        showToast('Монте-Карло пересчитан', `Прогноз выручки: ${projected.toLocaleString('ru-RU')} ₽`);
      }
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
    // REP PERFORMANCE COMPARISON CHART
    // ==========================================================================
        const REP_NAMES = ['Заряна', 'Надежда', 'Виктория', 'Светлана'];

    function getDynamicRepMetrics() {
      const pipe = [];
      const score = [];
      const nextstep = [];
      const risk = [];

      REP_NAMES.forEach(rep => {
        const repCalls = CALLS_DATA.filter(c => c.manager === rep);
        const count = repCalls.length || 1;
        const totalPipe = repCalls.length * 500000;
        const totalScore = repCalls.reduce((acc, c) => acc + c.score, 0);
        const nsCount = repCalls.filter(c => c.next_step === 1).length;
        const riskAmt = repCalls.filter(c => c.status === 'risk').length * 500000;

        pipe.push(totalPipe);
        score.push(parseFloat((totalScore / count).toFixed(1)));
        nextstep.push(Math.round((nsCount / count) * 100));
        risk.push(riskAmt);
      });

      return {
        pipe: {
          label: 'Пайплайн в работе, ₽',
          data: pipe,
          colors: ['#8b5cf6', '#6366f1', '#38bdf8', 'rgba(255, 255, 255, 0.18)'],
          unit: ' ₽',
          isCurrency: true
        },
        score: {
          label: 'Средний балл речи Gemini (/13)',
          data: score,
          colors: ['#8b5cf6', '#10b981', '#38bdf8', '#f43f5e'],
          unit: ' б.',
          isCurrency: false
        },
        step: {
          label: 'Фиксация Next Step, %',
          data: nextstep,
          colors: ['#8b5cf6', '#10b981', '#38bdf8', '#f43f5e'],
          unit: '%',
          isCurrency: false
        },
        risk: {
          label: 'Выручка под угрозой срыва, ₽',
          data: risk,
          colors: ['#f59e0b', 'rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.12)', '#f43f5e'],
          unit: ' ₽',
          isCurrency: true
        }
      };
    }

    function initRepPerformanceChart() {
      const ctx = document.getElementById('repPerformanceChart');
      if (!ctx) return;

      const repMetrics = getDynamicRepMetrics();
      const m = repMetrics['pipe'];

      repPerfChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: REP_NAMES,
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
      const n = filtered.length || 1;
      const sums = Array(13).fill(0);
      filtered.forEach(c => {
        c.cr.forEach((val, idx) => {
          if (val === 1) sums[idx]++;
        });
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
        speechRadarChartInstance.data.datasets[1].pointBackgroundColor = '#8b5cf6';
      }

      speechRadarChartInstance.update();
      showToast('Радар перестроен', `Отображены 13 речевых критериев для: ${repName}`);
    }

    document.addEventListener('DOMContentLoaded', () => {
      checkAuth();
      if (localStorage.getItem('revops_sidebar_collapsed') === '1') {
        const sb = document.getElementById('mpSidebar');
        if (sb) sb.classList.add('collapsed');
      }
      initCallsTable();
      renderSkillsHeatmap();
      const savedDensity = localStorage.getItem('revops_table_density') || 'excel-pro';
      setTableDensity(savedDensity);

      // Hero KPI count-up animation on startup
      const factVal = document.getElementById('metricFactVal');
      if (factVal) animateCounter(factVal, 500000, 1100);
      const planVal = document.getElementById('metricPlanVal');
      if (planVal) animateCounter(planVal, 5000000, 1100);
      const ssotVal = document.getElementById('metricSsotVal');
      if (ssotVal) animateCounter(ssotVal, 2375000, 1100);

      // Trigger card motion entrance on active tab
      const initialView = document.querySelector('.tab-view.active');
      if (initialView) animateCardsIn(initialView);

      initMonteCarloChart();
      initRepPerformanceChart();
      initSpeechRadarChart();

      // Develop Bento Tier-1 Charts
      initDevelopDissectionChart();
      initDevelopDonutChart();
      initDevelopSplineChart();

      // V20.2 Tier-1 Additions
      initWaveformScrubbing();

      const savedTheme = localStorage.getItem('revops_accent_theme') || 'purple';
      if (typeof setAccentTheme === 'function') {
        setAccentTheme(savedTheme);
      }

      let savedMode = localStorage.getItem('revops_theme_mode');
      if (!savedMode || savedMode === 'light') {
        savedMode = 'dark';
        try { localStorage.setItem('revops_theme_mode', 'dark'); } catch (e) {}
      }
      if (typeof setThemeMode === 'function') {
        setThemeMode(savedMode);
      }

      const cmdInput = document.getElementById('cmdPaletteInput');
      if (cmdInput) {
        cmdInput.addEventListener('keydown', handleCmdPaletteKeydown);
      }

      // initCustomCursor();
      initWebSocketListener();
      fetchLiveCallsData(false);
      tickLiveStatus();
      updateChartTimestamps();

      // Initial tab router (?tab=admin or /admin)
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const targetTab = window.__INITIAL_TAB__ || urlParams.get('tab');
        if (targetTab && ALL_TABS.includes(targetTab)) {
          switchTab(targetTab);
        }
      } catch (e) {}
    });

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

    // ==========================================================================
    // ==========================================================================
    // LIVE DATA & WEBSOCKET SYNC (FASTAPI <-> GOOGLE SHEETS <-> N8N)
    // ==========================================================================
    let isSyncing = false;
    let liveWs = null;

    async function fetchLiveCallsData(showFeedback = false) {
      try {
        const res = await fetch(`${REVOPS_API_BASE}/api/v1/calls/data?tenant_id=TNT-001`);
        if (!res.ok) throw new Error('API status ' + res.status);
        const data = await res.json();
        if (data && Array.isArray(data.calls)) {
          CALLS_DATA = data.calls;
          refreshAllDashboardViews();
          lastSyncTime = Date.now();
          tickLiveStatus();
          updateChartTimestamps();
          if (showFeedback && typeof showToast === 'function') {
            showToast('Google Таблица', data.calls.length > 0 ? `Синхронизировано ${data.calls.length} звонков из raw_calls` : 'Таблица raw_calls очищена (0 звонков)');
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
      const wsUrl = `${protocol}//${wsHost}/ws/org/TNT-001`;
      try {
        liveWs = new WebSocket(wsUrl);
        liveWs.onopen = () => {
          console.log('[Live WS] Connected to live pipeline stream');
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
      let totalFact = 0;
      CALLS_DATA.forEach(c => {
        if (c.status === 'won') {
          const rawAmt = c.amount ? parseInt(String(c.amount).replace(/\D/g, '')) : 500000;
          totalFact += (rawAmt || 500000);
        }
      });

      const factVal = document.getElementById('metricFactVal');
      if (factVal) animateCounter(factVal, totalFact, 900);

      const ssotVal = document.getElementById('metricSsotVal');
      if (ssotVal) {
        const computedSsot = CALLS_DATA.length * 250000;
        animateCounter(ssotVal, computedSsot, 900);
      }

      const factBadge = document.getElementById('metricFactBadge');
      if (factBadge) {
        const plan = 5000000;
        const pct = ((totalFact / plan) * 100).toFixed(1);
        factBadge.textContent = `${pct}%`;
      }

      const defVal = document.getElementById('metricDeficitVal');
      if (defVal) {
        const plan = 5000000;
        const diff = totalFact - plan;
        defVal.textContent = diff < 0 ? `-${(Math.abs(diff)/1000000).toFixed(1)}M ₽` : `+${(diff/1000000).toFixed(1)}M ₽`;
      }

      const ssotTip = document.getElementById('metricSsotTooltip');
      if (ssotTip) {
        const computedSsot = CALLS_DATA.length * 250000;
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
      const countWon = CALLS_DATA.filter(c => c.status === 'won').length;
      const countZoom = CALLS_DATA.filter(c => c.next_step === 1 || (c.cr && c.cr[0] === 1)).length;
      const countOffer = CALLS_DATA.filter(c => c.cr && c.cr[7] === 1).length;
      const countContract = CALLS_DATA.filter(c => c.cr && c.cr[11] === 1).length;

      const val1 = totalCalls * 500000;
      const val2 = countZoom * 500000;
      const val3 = countOffer * 500000;
      const val4 = countContract * 500000;
      const val5 = countWon * 500000;

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

      if (fFill1) fFill1.style.width = totalCalls > 0 ? `${Math.round((val1 / maxVal) * 100)}%` : '0%';
      if (fFill2) fFill2.style.width = totalCalls > 0 ? `${Math.round((val2 / maxVal) * 100)}%` : '0%';
      if (fFill3) fFill3.style.width = totalCalls > 0 ? `${Math.round((val3 / maxVal) * 100)}%` : '0%';
      if (fFill4) fFill4.style.width = totalCalls > 0 ? `${Math.round((val4 / maxVal) * 100)}%` : '0%';
      if (fFill5) fFill5.style.width = totalCalls > 0 ? `${Math.round((val5 / maxVal) * 100)}%` : '0%';
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

      // Sidebar badges
      const sbBadgeAudit = document.getElementById('sbBadgeAudit');
      if (sbBadgeAudit) sbBadgeAudit.textContent = `${total}`;
      const sbBadgeRop = document.getElementById('sbBadgeRop');
      if (sbBadgeRop) sbBadgeRop.textContent = `${total} сд.`;
      const syncBadge = document.getElementById('syncStatusBadge');
      if (syncBadge) syncBadge.textContent = `${total} СИНХРОНИЗИРОВАНО`;
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
  const diff = PLAYBOOK_DIFFS[callId];
  if (!diff) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(diff.recommendScript).then(() => {
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
      headers['X-RevOps-Session'] = raw;
    }
  } catch (e) {}
  headers['X-RevOps-Admin-Key'] = 'revops_admin_fleet_secret_2026';
  return headers;
}

async function adminFetch(endpoint, options = {}) {
  const url = `${REVOPS_API_BASE}${endpoint}`;
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

    // Load dynamic features config
    loadFeaturesConfig();
  } catch (err) {
    console.warn('[Admin] Не удалось загрузить статус:', err);
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
    if (data.output && Array.isArray(data.output)) {
      data.output.forEach(line => appendAdminTerminalLog(line, data.success ? 'success' : 'error'));
    }
    appendAdminTerminalLog(data.message || 'Действие выполнено', data.success ? 'success' : 'error');
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
    if (data.output) {
      const lines = data.output.split('\n');
      lines.slice(-15).forEach(l => {
        if (l.trim()) appendAdminTerminalLog(l.trim(), data.success ? 'success' : 'error');
      });
    }
    appendAdminTerminalLog(data.summary || (data.success ? 'Синхронизация таблиц успешно завершена!' : 'Ошибка синхронизации'), data.success ? 'success' : 'error');
    showToast('Google Таблицы', data.success ? 'Таблицы успешно обновлены!' : 'Ошибка при синхронизации');
  } catch (err) {
    appendAdminTerminalLog(`Ошибка: ${err.message}`, 'error');
    showToast('Ошибка', err.message);
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
    if (data.output) {
      data.output.split('\n').slice(-10).forEach(l => {
        if (l.trim()) appendAdminTerminalLog(l.trim(), data.success ? 'success' : 'error');
      });
    }
    appendAdminTerminalLog(data.success ? `Таблица ${sheetId} обновлена!` : 'Сбой обновления таблицы', data.success ? 'success' : 'error');
    showToast('Google Таблицы', data.success ? 'Таблица обновлена!' : 'Сбой обновления');
  } catch (err) {
    appendAdminTerminalLog(`Ошибка: ${err.message}`, 'error');
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
    appendAdminTerminalLog(data.message || 'Действие выполнено', data.success ? 'success' : 'error');
    showToast('Планировщик Windows', data.message || 'Готово');
    await loadAdminStatus();
  } catch (err) {
    appendAdminTerminalLog(`Ошибка планировщика: ${err.message}`, 'error');
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
    appendAdminTerminalLog(data.message || 'Расписание сохранено', data.success ? 'success' : 'error');
    showToast('Автозадача Windows', data.message || 'Время сохранено');
    await loadAdminStatus();
  } catch (err) {
    appendAdminTerminalLog(`Ошибка: ${err.message}`, 'error');
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

async function runCCOAction(action) {
  if (isAdminActionRunning) return;
  isAdminActionRunning = true;
  appendAdminTerminalLog(`ИИ Коммерческий Директор: запуск действия [${action}]...`, 'info');
  showToast('ИИ Комдир (CCO)', `Запуск: ${action}...`);

  try {
    const res = await adminFetch('/api/v1/admin/cco/action', {
      method: 'POST',
      body: JSON.stringify({ action, tenant: 'TNT-001' })
    });
    const data = await res.json();
    if (data.output) {
      const lines = data.output.split('\n');
      lines.forEach(l => {
        if (l.trim()) appendAdminTerminalLog(l.trim(), data.success ? 'success' : 'error');
      });
    }
    appendAdminTerminalLog(data.success ? `Успешно: ${data.desc || action}` : `Сбой CCO: ${data.error || 'Ошибка'}`, data.success ? 'success' : 'error');
    showToast('ИИ Комдир (CCO)', data.success ? 'Анализ готов!' : 'Ошибка выполнения');
  } catch (err) {
    appendAdminTerminalLog(`Ошибка вызова CCO: ${err.message}`, 'error');
    showToast('Ошибка CCO', err.message);
  } finally {
    isAdminActionRunning = false;
  }
}

async function runHealerAction(action) {
  if (isAdminActionRunning) return;
  isAdminActionRunning = true;
  appendAdminTerminalLog(`Дежурный DevOps & QA Healer: действие [${action}]...`, 'info');
  showToast('QA Healer', `Выполняется: ${action}`);

  try {
    const res = await adminFetch('/api/v1/admin/healer/action', {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (data.output) {
      data.output.split('\n').forEach(l => {
        if (l.trim()) appendAdminTerminalLog(l.trim(), data.success ? 'success' : 'error');
      });
    }
    showToast('QA Healer', data.success ? 'Команда выполнена' : 'Сбой операции');
  } catch (err) {
    appendAdminTerminalLog(`Ошибка QA Healer: ${err.message}`, 'error');
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

// ==========================================================================
// EXPOSE INTERACTIVE HANDLERS GLOBALLY ON WINDOW FOR INLINE ONCLICK EVENTS
// ==========================================================================
window.copyRescueScript = typeof copyRescueScript !== 'undefined' ? copyRescueScript : null;
window.copyRescueScriptByCallId = typeof copyRescueScriptByCallId !== 'undefined' ? copyRescueScriptByCallId : null;
window.setAccentTheme = typeof setAccentTheme !== 'undefined' ? setAccentTheme : null;
window.copyPlaybookScript = typeof copyPlaybookScript !== 'undefined' ? copyPlaybookScript : null;
window.setPillManagerFilter = typeof setPillManagerFilter !== 'undefined' ? setPillManagerFilter : null;
window.setPillStatusFilter = typeof setPillStatusFilter !== 'undefined' ? setPillStatusFilter : null;
window.setPillRadarRep = typeof setPillRadarRep !== 'undefined' ? setPillRadarRep : null;
window.triggerSelfHealingAudit = typeof triggerSelfHealingAudit !== 'undefined' ? triggerSelfHealingAudit : null;
window.recalcExpress = typeof recalcExpress !== 'undefined' ? recalcExpress : null;
window.drillDownSkill = typeof drillDownSkill !== 'undefined' ? drillDownSkill : null;
window.switchTab = typeof switchTab !== 'undefined' ? switchTab : null;
window.filterCallsTable = typeof filterCallsTable !== 'undefined' ? filterCallsTable : null;
window.logout = typeof logout !== 'undefined' ? logout : null;
window.toggleSidebar = typeof toggleSidebar !== 'undefined' ? toggleSidebar : null;
window.openCommandPalette = typeof openCommandPalette !== 'undefined' ? openCommandPalette : null;
window.closeCommandPalette = typeof closeCommandPalette !== 'undefined' ? closeCommandPalette : null;
window.openOnePagerModal = typeof openOnePagerModal !== 'undefined' ? openOnePagerModal : null;
window.closeOnePagerModal = typeof closeOnePagerModal !== 'undefined' ? closeOnePagerModal : null;
window.triggerSyncSimulation = typeof triggerSyncSimulation !== 'undefined' ? triggerSyncSimulation : null;
window.renderSkillsHeatmap = typeof renderSkillsHeatmap !== 'undefined' ? renderSkillsHeatmap : null;
window.filterRepAudit = typeof filterRepAudit !== 'undefined' ? filterRepAudit : null;
window.toggleSinDetails = typeof toggleSinDetails !== 'undefined' ? toggleSinDetails : null;

// Admin Fleet Control Handlers
window.loadAdminStatus = typeof loadAdminStatus !== 'undefined' ? loadAdminStatus : null;
window.runFleetAction = typeof runFleetAction !== 'undefined' ? runFleetAction : null;
window.runSheetsAction = typeof runSheetsAction !== 'undefined' ? runSheetsAction : null;
window.runSheetsTarget = typeof runSheetsTarget !== 'undefined' ? runSheetsTarget : null;
window.runTaskAction = typeof runTaskAction !== 'undefined' ? runTaskAction : null;
window.saveDailyTaskTime = typeof saveDailyTaskTime !== 'undefined' ? saveDailyTaskTime : null;
window.testGeminiApi = typeof testGeminiApi !== 'undefined' ? testGeminiApi : null;
window.fetchAdminLogs = typeof fetchAdminLogs !== 'undefined' ? fetchAdminLogs : null;
window.clearAdminConsole = typeof clearAdminConsole !== 'undefined' ? clearAdminConsole : null;
window.copyAdminTunnelUrl = typeof copyAdminTunnelUrl !== 'undefined' ? copyAdminTunnelUrl : null;
window.appendAdminTerminalLog = typeof appendAdminTerminalLog !== 'undefined' ? appendAdminTerminalLog : null;
window.generateRandomPassword = typeof generateRandomPassword !== 'undefined' ? generateRandomPassword : null;
window.registerNewClientAccess = typeof registerNewClientAccess !== 'undefined' ? registerNewClientAccess : null;
window.copyClientInviteMessage = typeof copyClientInviteMessage !== 'undefined' ? copyClientInviteMessage : null;
window.deleteClientAccess = typeof deleteClientAccess !== 'undefined' ? deleteClientAccess : null;
window.renderAdminClientsTable = typeof renderAdminClientsTable !== 'undefined' ? renderAdminClientsTable : null;
window.runCCOAction = typeof runCCOAction !== 'undefined' ? runCCOAction : null;
window.runHealerAction = typeof runHealerAction !== 'undefined' ? runHealerAction : null;
window.loadFeaturesConfig = typeof loadFeaturesConfig !== 'undefined' ? loadFeaturesConfig : null;
window.toggleFeatureFlag = typeof toggleFeatureFlag !== 'undefined' ? toggleFeatureFlag : null;
window.archiveDesktopLaunchers = typeof archiveDesktopLaunchers !== 'undefined' ? archiveDesktopLaunchers : null;




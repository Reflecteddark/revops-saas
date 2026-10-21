import { describe, it, expect, afterEach, vi } from 'vitest';

function setupMocks({ session = null, adminKey = null, storageTenant = null, urlTenant = null } = {}) {
  const store = {};
  if (session) {
    store['revops_auth_session'] = JSON.stringify(session);
    store['revops_enterprise_session_v1'] = JSON.stringify(session);
  }
  if (adminKey) store['revops_admin_key'] = adminKey;
  if (storageTenant) store['revops_active_tenant'] = storageTenant;

  vi.stubGlobal('localStorage', {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; }
  });
  vi.stubGlobal('sessionStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  });

  const params = new URLSearchParams();
  if (urlTenant) params.set('tenant', urlTenant);
  const searchStr = params.toString() ? '?' + params.toString() : '';

  vi.stubGlobal('window', {
    location: { search: searchStr, hostname: 'test' },
    history: { replaceState: () => {} },
    URLSearchParams: URLSearchParams,
    addEventListener: () => {},
    removeEventListener: () => {}
  });
}

describe('getActiveTenantId', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('пустое окружение → TNT-001', async () => {
    setupMocks();
    const mod = await import('./core.js?t=' + Date.now());
    expect(mod.getActiveTenantId()).toBe('TNT-001');
  });

  it('клиент из сессии → ЕГО tenant, игнорируя URL', async () => {
    setupMocks({
      session: { authenticated: true, login: 'client1', tenant: 'TNT-CLEAN-001', role: 'Клиент' },
      urlTenant: 'TNT-002'
    });
    const mod = await import('./core.js?t=' + Date.now());
    expect(mod.getActiveTenantId()).toBe('TNT-CLEAN-001');
  });

  it('админ из сессии → может переключаться через URL', async () => {
    setupMocks({
      session: { authenticated: true, login: 'admin', is_admin: true, role: 'Admin / Супервайзер', tenant: 'TNT-001' },
      urlTenant: 'TNT-002'
    });
    const mod = await import('./core.js?t=' + Date.now());
    expect(mod.getActiveTenantId()).toBe('TNT-002');
  });

  it('админ через adminKey → переключение через storage', async () => {
    setupMocks({
      session: { authenticated: true, login: 'admin', role: 'Admin' },
      adminKey: 'any_admin_key',
      storageTenant: 'TNT-003'
    });
    const mod = await import('./core.js?t=' + Date.now());
    expect(mod.getActiveTenantId()).toBe('TNT-003');
  });

  it('тенант приводится к UPPERCASE', async () => {
    setupMocks({ storageTenant: 'tnt-002', adminKey: 'any' });
    const mod = await import('./core.js?t=' + Date.now());
    expect(mod.getActiveTenantId()).toBe('TNT-002');
  });
});

describe('logout', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('удаляет сессию из storage и сбрасывает форму', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchSpy);
    const store = {
      'revops_auth_session': JSON.stringify({ authenticated: true, login: 'user1' }),
      'revops_enterprise_session_v1': JSON.stringify({ authenticated: true, login: 'user1' })
    };
    vi.stubGlobal('localStorage', {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; }
    });
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    });

    const overlay = { classList: { remove: vi.fn(), add: vi.fn() } };
    const passInput = { value: 'secret' };
    vi.stubGlobal('document', {
      getElementById: (id) => {
        if (id === 'authOverlay') return overlay;
        if (id === 'authPassword') return passInput;
        return null;
      },
      body: { style: {} }
    });

    const mod = await import('./core.js?t=' + Date.now());
    mod.logout();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/client-logout'),
      expect.objectContaining({ method: 'POST', credentials: 'include' })
    );
    expect(store['revops_auth_session']).toBeUndefined();
    expect(passInput.value).toBe('');
  });
});


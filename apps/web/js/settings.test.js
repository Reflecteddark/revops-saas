import { describe, it, expect, afterEach, vi } from 'vitest';

describe('getMonthlyTarget', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('пустые настройки → дефолт 5 000 000', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { getElementById: () => null });
    const raw = await import('./settings.js?t=' + Date.now());
    const mod = raw.default || raw;
    // SYSTEM_SETTINGS = null в свежем модуле
    expect(mod.getMonthlyTarget()).toBe(5000000);
  });

  it('SYSTEM_SETTINGS = null → дефолт 5 000 000', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { getElementById: () => null });
    const raw = await import('./settings.js?t=' + Date.now());
    const mod = raw.default || raw;
    mod.SYSTEM_SETTINGS = null;
    expect(mod.getMonthlyTarget()).toBe(5000000);
  });

  it('SYSTEM_SETTINGS.general.monthly_target = 10 000 000 → возвращает 10M', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { getElementById: () => null });
    const raw = await import('./settings.js?t=' + Date.now());
    const mod = raw.default || raw;
    mod.SYSTEM_SETTINGS = { general: { monthly_target: 10000000 } };
    expect(mod.getMonthlyTarget()).toBe(10000000);
  });

  it('monthly_target = 0 → fallback на 5M (защита от деления на 0)', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { getElementById: () => null });
    const raw = await import('./settings.js?t=' + Date.now());
    const mod = raw.default || raw;
    mod.SYSTEM_SETTINGS = { general: { monthly_target: 0 } };
    expect(mod.getMonthlyTarget()).toBe(5000000);
  });

  it('monthly_target как строка "3000000" → возвращает число 3000000', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', { getElementById: () => null });
    const raw = await import('./settings.js?t=' + Date.now());
    const mod = raw.default || raw;
    mod.SYSTEM_SETTINGS = { general: { monthly_target: '3000000' } };
    expect(mod.getMonthlyTarget()).toBe(3000000);
  });

  it('updateAutonomyUIState корректно переключает бейдж пассивного и автономного режима', async () => {
    const mockElements = {
      autonomyCrmMutations: { checked: false },
      autonomyTelegramNotifications: { checked: false },
      autonomyClientCommunication: { checked: false },
      autonomyModeBadge: { textContent: '', className: '', style: {} },
      autonomyCrmMutationsDesc: { textContent: '', style: {} },
      autonomyTelegramNotificationsDesc: { textContent: '', style: {} },
      autonomyClientCommunicationDesc: { textContent: '', style: {} },
    };

    const windowObj = {};
    vi.stubGlobal('window', windowObj);
    vi.stubGlobal('document', {
      getElementById: (id) => mockElements[id] || null,
    });

    await import('./settings.js?t=' + (Date.now() + 1));
    expect(typeof windowObj.updateAutonomyUIState).toBe('function');

    // 1. По умолчанию: безопасный пассивный режим
    mockElements.autonomyCrmMutations.checked = false;
    windowObj.updateAutonomyUIState();
    expect(mockElements.autonomyModeBadge.textContent).toContain('БЕЗОПАСНЫЙ ПАССИВНЫЙ РЕЖИМ');
    expect(mockElements.autonomyCrmMutationsDesc.textContent).toContain('ВЫКЛЮЧЕНО (По умолчанию)');

    // 2. Включение мутаций CRM
    mockElements.autonomyCrmMutations.checked = true;
    windowObj.updateAutonomyUIState();
    expect(mockElements.autonomyModeBadge.textContent).toContain('АВТОНОМНЫЙ РЕЖИМ');
    expect(mockElements.autonomyCrmMutationsDesc.textContent).toContain('ВКЛЮЧЕНО: ИИ разрешено');
  });
});

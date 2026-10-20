import { describe, it, expect, afterEach, vi } from 'vitest';

describe('getPlaybookDiff', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('null → возвращает fallback с обоими полями', async () => {
    vi.stubGlobal('window', {});
    const raw = await import('./calls.js?t=' + Date.now());
    const mod = raw.default || raw;
    const diff = mod.getPlaybookDiff(null);
    expect(diff).toHaveProperty('defectQuote');
    expect(diff).toHaveProperty('recommendScript');
    expect(diff.defectQuote.length).toBeGreaterThan(10);
    expect(diff.recommendScript.length).toBeGreaterThan(10);
  });

  it('undefined → тоже fallback', async () => {
    vi.stubGlobal('window', {});
    const raw = await import('./calls.js?t=' + Date.now());
    const mod = raw.default || raw;
    const diff = mod.getPlaybookDiff(undefined);
    expect(diff.defectQuote.length).toBeGreaterThan(10);
    expect(diff.recommendScript.length).toBeGreaterThan(10);
  });

  it('известный id b24_activity_78 → берёт шаблон из PLAYBOOK_DIFFS', async () => {
    vi.stubGlobal('window', {});
    const raw = await import('./calls.js?t=' + Date.now());
    const mod = raw.default || raw;
    const diff = mod.getPlaybookDiff({ id: 'b24_activity_78' });
    // Проверяем ключевые слова из шаблона для b24_78
    expect(diff.recommendScript).toContain('вторник');
    expect(diff.recommendScript).toContain('12:00');
    expect(diff.defectQuote).toContain('почту');
  });

  it('неизвестный id + next_step=0 → генерирует скрипт про Zoom', async () => {
    vi.stubGlobal('window', {});
    const raw = await import('./calls.js?t=' + Date.now());
    const mod = raw.default || raw;
    const diff = mod.getPlaybookDiff({ id: 'unknown_xyz', next_step: 0 });
    expect(diff.recommendScript.length).toBeGreaterThan(20);
    // Должно быть про Zoom или про 14:00 из fallback-генератора
    expect(diff.recommendScript.toLowerCase()).toMatch(/zoom|14:00|среду/);
  });

  it('неизвестный id + next_step=1 → генерирует скрипт про подтверждение', async () => {
    vi.stubGlobal('window', {});
    const raw = await import('./calls.js?t=' + Date.now());
    const mod = raw.default || raw;
    const diff = mod.getPlaybookDiff({ id: 'unknown_xyz', next_step: 1 });
    expect(diff.recommendScript.length).toBeGreaterThan(20);
    // Должно быть про следующий контакт
    expect(diff.recommendScript.toLowerCase()).toMatch(/четверг|11:00|следующего/);
  });

  it('call с длинным error_summary → defectQuote содержит текст ошибки', async () => {
    vi.stubGlobal('window', {});
    const raw = await import('./calls.js?t=' + Date.now());
    const mod = raw.default || raw;
    const diff = mod.getPlaybookDiff({
      id: 'unknown_xyz',
      error_summary: 'Клиент сказал что дорого и ушёл думать'
    });
    expect(diff.defectQuote).toContain('дорого');
  });

  it('всегда возвращает непустые строки для обоих полей', async () => {
    vi.stubGlobal('window', {});
    const raw = await import('./calls.js?t=' + Date.now());
    const mod = raw.default || raw;
    const cases = [null, undefined, {}, { next_step: 0 }, { next_step: 1 }];
    cases.forEach(c => {
      const diff = mod.getPlaybookDiff(c);
      expect(typeof diff.defectQuote).toBe('string');
      expect(typeof diff.recommendScript).toBe('string');
      expect(diff.defectQuote.length).toBeGreaterThan(0);
      expect(diff.recommendScript.length).toBeGreaterThan(0);
    });
  });
});

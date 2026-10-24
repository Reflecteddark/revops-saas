import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Anti-Fake-Fallback Guards', () => {
  const dealsJs = readFileSync(resolve(__dirname, '../deals.js'), 'utf-8');
  const callsJs = readFileSync(resolve(__dirname, '../calls.js'), 'utf-8');

  it('deals.js: нет length * 500000', () => {
    expect(dealsJs).not.toMatch(/length\s*\*\s*500000/);
  });

  it('calls.js: getCallAmount не возвращает 300000', () => {
    const fn = callsJs.match(/function getCallAmount[\s\S]*?\n}/);
    expect(fn).toBeTruthy();
    expect(fn[0]).not.toContain('300000');
  });

  it('analyst.js: нет avg_score: 9.5', () => {
    const analystJs = readFileSync(resolve(__dirname, '../analyst.js'), 'utf-8');
    expect(analystJs).not.toMatch(/avg_score:\s*9\.5/);
  });
});

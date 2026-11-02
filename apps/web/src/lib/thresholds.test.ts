import { describe, it, expect } from 'vitest';
import { getCallScoreBand } from './thresholds';

describe('getCallScoreBand', () => {
  it('maps scores to bands using CALL_SCORE_THRESHOLDS', () => {
    expect(getCallScoreBand(13)).toBe('high');
    expect(getCallScoreBand(9)).toBe('high');
    expect(getCallScoreBand(8)).toBe('mid');
    expect(getCallScoreBand(6)).toBe('mid');
    expect(getCallScoreBand(5)).toBe('low');
    expect(getCallScoreBand(0)).toBe('low');
  });

  it('treats missing score as unrated, never as 0', () => {
    expect(getCallScoreBand(null)).toBe('unrated');
    expect(getCallScoreBand(undefined)).toBe('unrated');
    expect(getCallScoreBand(Number.NaN)).toBe('unrated');
  });
});

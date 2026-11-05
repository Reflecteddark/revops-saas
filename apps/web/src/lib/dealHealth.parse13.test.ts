import { describe, expect, it } from 'vitest';
import { parse13Criteria } from './dealHealth';

describe('parse13Criteria', () => {
  it('a criterion that did not apply (null in CR5, CR6, CR13) is neither passed nor a failure', () => {
    const list = parse13Criteria({ cr: [1, 1, 0, 1, null, 1, 1, 1, 1, 0, 1, 1, null] });

    expect(list).toHaveLength(13);
    expect(list.filter((c) => c.notApplicable).map((c) => c.id)).toEqual(['cr5', 'cr13']);
    expect(list.filter((c) => c.passed)).toHaveLength(9);
    expect(list.filter((c) => !c.notApplicable)).toHaveLength(11);
  });

  it('a call nobody talked on, or one the AI could not read, has no criteria to show', () => {
    for (const kind of ['unanswered', 'audit_failed', 'unrated']) {
      expect(parse13Criteria({ kind, cr: Array(13).fill(null) })).toEqual([]);
    }
    expect(parse13Criteria({ kind: 'assessed', cr: Array(13).fill(1) })).toHaveLength(13);
  });

  it('a null in any other criterion is still just not passed', () => {
    const list = parse13Criteria({ cr: [null, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] });
    expect(list[0]).toMatchObject({ id: 'cr1', passed: false, notApplicable: false });
  });
});

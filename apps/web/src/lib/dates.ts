/**
 * apps/web/src/lib/dates.ts
 *
 * Business-day helpers. A call at 22:30 UTC is 01:30 in Moscow and belongs to the NEXT working day of the РОП,
 * so "today", "yesterday" and "last 7 days" must be computed in the business time zone - not with
 * toISOString() (UTC) and not with the viewer's browser zone.
 *
 * The API returns call dates as local wall time of the client ("2026-11-03 01:30:00", the same format n8n writes to
 * Sheets), or as ISO with an explicit zone, or as "DD.MM.YYYY HH:MM" from hand-edited sheets.
 */

export const BUSINESS_TZ = 'Europe/Moscow';
const BUSINESS_OFFSET = '+03:00'; // Moscow has no DST since 2014

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar day 'YYYY-MM-DD' of an instant in the business time zone. */
export function businessDayKey(d: Date = new Date()): string {
  return dayFormatter.format(d);
}

/** 'YYYY-MM-DD' +/- n days (pure calendar arithmetic, no zone involved). */
export function addDaysToKey(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

/** Day of month, days in that month and 'YYYY-MM' for a day key. */
export function monthInfo(key: string): { dayOfMonth: number; daysInMonth: number; month: string } {
  const [y, m, d] = key.split('-').map(Number);
  return {
    dayOfMonth: d,
    daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate(),
    month: key.slice(0, 7),
  };
}

const ISO_WALL = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const RU_WALL = /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

interface Wall {
  day: string;
  hour: number | null;
  minute: number;
  second: number;
}

function parseWall(raw: string): Wall | null {
  const s = raw.trim();
  let m = ISO_WALL.exec(s);
  if (m) {
    return {
      day: m[1],
      hour: m[2] !== undefined ? Number(m[2]) : null,
      minute: Number(m[3] ?? 0),
      second: Number(m[4] ?? 0),
    };
  }
  m = RU_WALL.exec(s);
  if (m) {
    return {
      day: `${m[3]}-${m[2]}-${m[1]}`, // 02.11.2026 is Nov 2nd, not Feb 11th
      hour: m[4] !== undefined ? Number(m[4]) : null,
      minute: Number(m[5] ?? 0),
      second: Number(m[6] ?? 0),
    };
  }
  return null;
}

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

/** The business-day key of a call date string, or null when it cannot be read. */
export function callDayKey(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T.*/.test(s) && HAS_ZONE.test(s)) {
    const t = new Date(s);
    return isNaN(t.getTime()) ? null : businessDayKey(t);
  }
  return parseWall(s)?.day ?? null;
}

/** Hour (0-23) of the call in business time, or null for date-only values. */
export function callHour(raw?: string | null): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T.*/.test(s) && HAS_ZONE.test(s)) {
    const t = new Date(s);
    if (isNaN(t.getTime())) return null;
    return Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: BUSINESS_TZ, hour: '2-digit', hour12: false }).format(t)
    ) % 24;
  }
  return parseWall(s)?.hour ?? null;
}

/** The instant of a call date string (wall time is read as business time), or null. */
export function callInstant(raw?: string | null): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T.*/.test(s) && HAS_ZONE.test(s)) {
    const t = new Date(s);
    return isNaN(t.getTime()) ? null : t;
  }
  const w = parseWall(s);
  if (!w) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  const t = new Date(`${w.day}T${p(w.hour ?? 0)}:${p(w.minute)}:${p(w.second)}${BUSINESS_OFFSET}`);
  return isNaN(t.getTime()) ? null : t;
}

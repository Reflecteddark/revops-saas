/**
 * apps/web/src/lib/systemNames.ts
 *
 * Single Source of Truth for system bot names, IVR, and non-rep participants.
 */

export const SYSTEM_BOT_NAMES = new Set([
  'Автоответчик',
  'Недозвон',
  'Не представился',
  'Неизвестный',
  'Неизвестно',
  'Менеджер',
  '-',
  '',
]);

export const isSystemName = (name?: string | null): boolean => {
  if (!name) return true;
  const clean = name.trim();
  if (!clean || SYSTEM_BOT_NAMES.has(clean)) return true;
  const lower = clean.toLowerCase();
  return (
    lower === 'автоответчик' ||
    lower === 'недозвон' ||
    lower === 'не представился' ||
    lower === 'неизвестный' ||
    lower === 'неизвестно' ||
    lower === 'менеджер' ||
    lower === '-'
  );
};

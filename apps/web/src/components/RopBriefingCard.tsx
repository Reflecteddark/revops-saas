/**
 * apps/web/src/components/RopBriefingCard.tsx
 *
 * Daily ROP Briefing & Sales Meeting Action Items Widget.
 * Synthesizes 24-hour speech audit findings into 3 actionable coaching points:
 * 1. Main systemic flaw across the team (lowest CR compliance & leakage amount)
 * 2. Top performer to praise (highest score & next step rate)
 * 3. Individual reps needing immediate coaching intervention
 * Includes one-click Telegram meeting agenda export.
 */

import * as React from 'react';
import { Sparkles, AlertTriangle, Trophy, UserX, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Call } from '@/types/api';
import { CR_DEFINITIONS } from '@/lib/criteria';
import { isSystemName } from '@/lib/systemNames';
import {
  COACHING_THRESHOLD,
  NEXT_STEP_MIN_PCT,
  MIN_CALLS_FOR_COACHING,
} from '@/lib/thresholds';

export interface RopBriefingCardProps {
  calls?: Call[];
  onSelectRep?: (repName: string) => void;
  onSelectCriterion?: (crIndex: number) => void;
  className?: string;
}

export function RopBriefingCard({
  calls = [],
  onSelectRep,
  onSelectCriterion,
  className,
}: RopBriefingCardProps) {
  const [copied, setCopied] = React.useState(false);

  // Analysis computation
  const briefing = React.useMemo(() => {
    const validCalls = calls.filter((c) => !isSystemName(c.manager));

    if (validCalls.length === 0) {
      return null;
    }

    const totalCalls = validCalls.length;

    // 1. Find the worst department-wide criterion (lowest pass rate)
    const crStats = Array.from({ length: 13 }).map((_, idx) => {
      let passCount = 0;
      let riskSum = 0;
      validCalls.forEach((c) => {
        if (c.cr && c.cr[idx] === 1) {
          passCount += 1;
        } else {
          riskSum += c.amount_num || 0;
        }
      });
      const rate = passCount / totalCalls;
      return {
        index: idx,
        passCount,
        failedCount: totalCalls - passCount,
        rate,
        riskSum,
      };
    });

    // Sort by failure rate descending (lowest pass rate first)
    const worstCr = [...crStats].sort((a, b) => a.rate - b.rate)[0];
    const worstCrDef = CR_DEFINITIONS[worstCr.index] || {
      id: `cr${worstCr.index + 1}`,
      label: `Критерий ${worstCr.index + 1}`,
      shortLabel: `CR${worstCr.index + 1}`,
    };

    // 2. Group by manager
    const managerMap = new Map<string, Call[]>();
    validCalls.forEach((c) => {
      const name = c.manager!.trim();
      if (!managerMap.has(name)) managerMap.set(name, []);
      managerMap.get(name)!.push(c);
    });

    const repStats: {
      name: string;
      callsCount: number;
      avgScore: number;
      nextStepPct: number;
      riskSum: number;
    }[] = [];

    managerMap.forEach((repCalls, name) => {
      const count = repCalls.length;
      const scoreSum = repCalls.reduce((acc, c) => acc + (c.score || 0), 0);
      const nextStepCount = repCalls.filter((c) => c.next_step === 1).length;
      const riskSum = repCalls.reduce((acc, c) => acc + (c.amount_num || 0), 0);

      repStats.push({
        name,
        callsCount: count,
        avgScore: count > 0 ? scoreSum / count : 0,
        nextStepPct: count > 0 ? Math.round((nextStepCount / count) * 100) : 0,
        riskSum,
      });
    });

    // Top performer: highest avg score (tie breaker: next step)
    const sortedByScore = [...repStats].sort((a, b) => {
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      return b.nextStepPct - a.nextStepPct;
    });
    const topRep = sortedByScore[0] || null;

    // Reps needing coaching (A7): minimum MIN_CALLS_FOR_COACHING calls, score < COACHING_THRESHOLD or nextStepPct < NEXT_STEP_MIN_PCT
    const eligibleReps = repStats.filter((r) => r.callsCount >= MIN_CALLS_FOR_COACHING);
    const coachingCandidates = eligibleReps
      .filter((r) => r.avgScore < COACHING_THRESHOLD || r.nextStepPct < NEXT_STEP_MIN_PCT)
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 3);

    return {
      totalCalls,
      worstCr,
      worstCrDef,
      topRep,
      coachingCandidates,
    };
  }, [calls]);

  const handleCopyAgenda = () => {
    if (!briefing) return;
    const { worstCr, worstCrDef, topRep, coachingCandidates, totalCalls } = briefing;

    const worstPct = Math.round(worstCr.rate * 100);
    const worstFailCount = worstCr.failedCount;

    const coachingStr =
      coachingCandidates.length > 0
        ? coachingCandidates
            .map((c) => `• ${c.name} (${c.avgScore.toFixed(1)}/13, Next Step: ${c.nextStepPct}%)`)
            .join('\n')
        : '• Все менеджеры держат норматив';

    const text = `⚡ Планёрка ОП — Фокус дня (RevOps ИИ):

🚨 Системная дыра отдела:
${worstCrDef.label} (CR${worstCr.index + 1}) — соблюдается лишь в ${worstPct}% звонков (${worstFailCount} из ${totalCalls} без зачёта).

🏆 Кого похвалить:
${topRep ? `${topRep.name} — балл ${topRep.avgScore.toFixed(1)}/13, Next Step ${topRep.nextStepPct}%.` : '—'}

⚠️ Персональный разбор на планёрке:
${coachingStr}

👉 Задача дня: в каждом звонке фиксировать дату и время следующего шага в CRM.`;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (!briefing) {
    return (
      <div
        className={cn(
          'surface rounded-xl border border-subtle p-5 text-center text-xs text-secondary',
          className
        )}
        data-testid="rop-briefing-empty"
      >
        <Sparkles className="mx-auto mb-2 h-6 w-6 text-primary" />
        <div className="font-semibold text-foreground">ИИ-Брифинг дня</div>
        <p className="mt-1 text-tertiary">
          Ожидание звонков для автоматического формирования повестки планёрки РОПа.
        </p>
      </div>
    );
  }

  const { worstCr, worstCrDef, topRep, coachingCandidates, totalCalls } = briefing;
  const passPct = Math.round(worstCr.rate * 100);

  return (
    <div
      className={cn(
        'surface flex flex-col justify-between space-y-4 rounded-xl border border-subtle p-5 shadow-sm',
        className
      )}
      data-testid="rop-briefing-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-subtle pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              ⚡ Фокус дня для планёрки РОПа
            </h3>
            <p className="text-[11px] text-tertiary">
              Сформировано ИИ на основе аудита {totalCalls}{' '}
              {totalCalls === 1 ? 'звонка' : 'звонков'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopyAgenda}
          className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-hover px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
          title="Скопировать готовый сценарий планёрки в Telegram"
          data-testid="copy-agenda-btn"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-emerald-500">Скопировано!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-secondary" />
              <span>В Telegram</span>
            </>
          )}
        </button>
      </div>

      {/* 3 Action Items */}
      <div className="space-y-3">
        {/* 1. Systemic Weakness */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelectCriterion?.(worstCr.index)}
          onKeyDown={(e) => e.key === 'Enter' && onSelectCriterion?.(worstCr.index)}
          className="group cursor-pointer rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10"
          title="Кликните, чтобы отфильтровать таблицу звонков по этому критерию"
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-500 dark:text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Главная системная дыра отдела:</span>
          </div>
          <div className="mt-1 text-[13px] font-bold text-foreground">
            {worstCrDef.label}{' '}
            <span className="font-mono text-xs font-semibold text-rose-500">
              (CR{worstCr.index + 1})
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-secondary">
            Соблюдается лишь в{' '}
            <span className="font-bold text-rose-500">{passPct}%</span> звонков ({worstCr.failedCount} из {totalCalls} без зачёта).{' '}
            {worstCr.riskSum > 0 && (
              <span>
                Объём сделок в риске:{' '}
                <span className="font-semibold text-foreground">
                  {Math.round(worstCr.riskSum).toLocaleString('ru-RU')} ₽
                </span>
                .
              </span>
            )}
          </p>
        </div>

        {/* 2. Top Performer to Praise */}
        {topRep && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectRep?.(topRep.name)}
            onKeyDown={(e) => e.key === 'Enter' && onSelectRep?.(topRep.name)}
            className="group cursor-pointer rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10"
            title="Кликните, чтобы показать звонки лидера"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Trophy className="h-3.5 w-3.5 shrink-0" />
              <span>Кого похвалить на планёрке:</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-[13px] font-bold text-foreground">
                {topRep.name}
              </span>
              <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {topRep.avgScore.toFixed(1)} / 13
              </span>
            </div>
            <p className="mt-1 text-[11px] text-secondary">
              Next Step: {topRep.nextStepPct}% • Лидер команды по среднему баллу и конверсии в шаг.
            </p>
          </div>
        )}

        {/* 3. Individual Coaching */}
        {coachingCandidates.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <UserX className="h-3.5 w-3.5 shrink-0" />
              <span>Кого разобрать индивидуально:</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {coachingCandidates.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => onSelectRep?.(c.name)}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-amber-500/20"
                  title={`Показать звонки менеджера: ${c.name}`}
                >
                  <span>{c.name}</span>
                  <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
                    ({c.avgScore.toFixed(1)})
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-tertiary">
              Кликните на имя менеджера для фильтрации его звонков с ошибками.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default RopBriefingCard;

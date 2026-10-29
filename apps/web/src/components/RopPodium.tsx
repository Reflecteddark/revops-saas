/**
 * apps/web/src/components/RopPodium.tsx
 *
 * ROP Leadership Podium & Hazard rep alert widget.
 * Highlights Top-3 sales performers (Gold, Silver, Bronze)
 * and surfaces critical risk reps needing call review/coaching.
 */

import * as React from 'react';
import { PODIUM_ATTENTION_THRESHOLD } from '@/lib/thresholds';
import { Crown, Trophy, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Call } from '@/types/api';

export interface RopPodiumProps {
  calls?: Call[];
  onSelectRep?: (repName: string) => void;
  selectedRep?: string | null;
  className?: string;
}

export interface ManagerPerformance {
  name: string;
  callsCount: number;
  scoresSum: number;
  avgScore: number;
  pipeAmt: number;
  nextStepWon: number;
  nextStepPct: number;
  riskCallsCount: number;
}

export function RopPodium({
  calls = [],
  onSelectRep,
  selectedRep,
  className,
}: RopPodiumProps) {
  const { top1, top2, top3, hazardRep } = React.useMemo(() => {
    if (!calls || calls.length === 0) {
      return { top1: null, top2: null, top3: null, hazardRep: null };
    }

    const mgrMap = new Map<string, ManagerPerformance>();

    calls.forEach((c) => {
      const name = (c.manager || 'Менеджер').trim();
      if (!mgrMap.has(name)) {
        mgrMap.set(name, {
          name,
          callsCount: 0,
          scoresSum: 0,
          avgScore: 0,
          pipeAmt: 0,
          nextStepWon: 0,
          nextStepPct: 0,
          riskCallsCount: 0,
        });
      }

      const m = mgrMap.get(name)!;
      m.callsCount += 1;
      m.scoresSum += c.score ?? 8;
      const amt = c.amount_num || 0;
      m.pipeAmt += amt;

      if (c.next_step === 1 || c.cr?.[0] === 1) {
        m.nextStepWon += 1;
      }
      if (
        c.status === 'lost' ||
        c.status === 'risk' ||
        (c.score !== null && c.score < 8) ||
        c.next_step === 0
      ) {
        m.riskCallsCount += 1;
      }
    });

    const managers = Array.from(mgrMap.values()).map((m) => ({
      ...m,
      avgScore: m.callsCount > 0 ? m.scoresSum / m.callsCount : 0,
      nextStepPct:
        m.callsCount > 0 ? Math.round((m.nextStepWon / m.callsCount) * 100) : 0,
    }));

    const isSystemName = (n: string) => {
      const lower = n.toLowerCase();
      return (
        lower.includes('не представился') ||
        lower.includes('менеджер') ||
        lower.includes('автоответчик') ||
        lower.includes('неизвестно') ||
        !n.trim()
      );
    };

    const validManagers = managers.filter((m) => !isSystemName(m.name));
    const allCandidates = validManagers.length > 0 ? validManagers : managers;

    // Sort by avgScore desc, then pipeAmt desc
    allCandidates.sort(
      (a, b) => b.avgScore - a.avgScore || b.pipeAmt - a.pipeAmt
    );

    const top1 = allCandidates[0] || null;
    const top2 = allCandidates.length > 1 ? allCandidates[1] : null;
    const top3 = allCandidates.length > 2 ? allCandidates[2] : null;

    // Hazard rep: lowest avgScore or highest riskCallsCount (excludes system placeholder names like 'Не представился')
    const risky = [...allCandidates].filter(
      (m) => m.riskCallsCount > 0 || m.avgScore < PODIUM_ATTENTION_THRESHOLD
    );
    risky.sort(
      (a, b) => a.avgScore - b.avgScore || b.riskCallsCount - a.riskCallsCount
    );
    const hazardRep = risky.length > 0 ? risky[0] : null;

    return { top1, top2, top3, hazardRep };
  }, [calls]);

  if (!top1) {
    return (
      <div
        className={cn(
          'surface space-y-2 rounded-xl border border-subtle p-6 text-center',
          className
        )}
        data-testid="rop-podium-empty"
      >
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-hover text-tertiary">
          <Trophy className="h-5 w-5" />
        </div>
        <h4 className="text-[13px] font-semibold text-foreground">
          Нет данных для пьедестала
        </h4>
        <p className="mx-auto max-w-sm text-xs text-secondary">
          Требуются звонки менеджеров для формирования рейтинга эффективности.
        </p>
      </div>
    );
  }

  const renderCard = (
    rep: ManagerPerformance | null,
    rank: number,
    badgeText: string,
    isFirst: boolean
  ) => {
    if (!rep) return null;
    const isSelected = selectedRep === rep.name;

    return (
      <div
        key={rep.name}
        role="button"
        tabIndex={0}
        onClick={() => onSelectRep?.(rep.name)}
        onKeyDown={(e) => e.key === 'Enter' && onSelectRep?.(rep.name)}
        className={cn(
          'surface relative flex cursor-pointer flex-col justify-between rounded-xl border p-5 transition-all',
          isFirst
            ? 'border-amber-500/40 bg-amber-500/[0.04] md:-translate-y-2 md:shadow-lg'
            : 'bg-hover/20 hover:bg-hover/50 border-subtle',
          isSelected && 'ring-2 ring-violet-500/50'
        )}
        data-testid={`podium-card-${rank}`}
      >
        {/* Top Tag & Crown */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider',
              isFirst
                ? 'bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/20'
                : 'border border-subtle bg-hover text-secondary'
            )}
          >
            {isFirst && <Crown className="h-3 w-3 text-amber-400" />}
            {rank} место • {badgeText}
          </span>
          <span className="font-mono text-xs tabular-nums text-tertiary">
            {rep.callsCount} {rep.callsCount === 1 ? 'звонок' : 'звонков'}
          </span>
        </div>

        {/* Manager Header */}
        <div className="mb-4 flex items-center gap-3">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold',
              isFirst
                ? 'bg-amber-500/20 text-amber-300 ring-2 ring-amber-500/40'
                : 'border border-subtle bg-hover text-foreground'
            )}
          >
            {rep.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h4
              className={cn(
                'truncate text-sm font-bold',
                isFirst ? 'text-amber-300' : 'text-foreground'
              )}
            >
              {rep.name}
            </h4>
            <div className="mt-0.5 text-xs text-secondary">
              В работе:{' '}
              <span className="font-mono font-medium tabular-nums text-foreground">
                {rep.pipeAmt.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          </div>
        </div>

        {/* Metrics Box */}
        <div className="bg-background/50 space-y-2 rounded-lg border border-subtle p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-secondary">Качество речи:</span>
            <span className="font-mono font-semibold tabular-nums text-emerald-400">
              {rep.avgScore.toFixed(1)} / 13
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-secondary">Next Step:</span>
            <span className="font-semibold tabular-nums text-emerald-400">
              {rep.nextStepPct}% ({rep.nextStepWon} шт.)
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn('space-y-4', className)} data-testid="rop-podium">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-subtle bg-hover text-foreground">
            <Trophy className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">
              Пьедестал РОПа & Лидерборд
            </h3>
            <p className="text-xs text-secondary">
              Топ-менеджеры по качеству звонков и конверсии договоренностей
            </p>
          </div>
        </div>
      </div>

      {/* Podium 3 Cards Grid (Order: 2nd, 1st, 3rd) */}
      <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-3">
        {renderCard(top2, 2, 'Эталон скрипта', false)}
        {renderCard(top1, 1, 'Топ-перформер', true)}
        {renderCard(top3, 3, 'Стабильность', false)}
      </div>

      {/* P0 Hazard Manager Alert Strip */}
      {hazardRep && (
        <div
          className="surface flex flex-col justify-between gap-3 rounded-xl border border-rose-500/25 bg-rose-500/[0.04] p-4 transition-colors hover:bg-rose-500/[0.07] sm:flex-row sm:items-center"
          data-testid="hazard-rep-alert"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-xs font-bold text-rose-300 ring-1 ring-inset ring-rose-500/30">
              {hazardRep.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-400">
                  <AlertTriangle className="h-3 w-3" />
                  P0 Зона критического риска
                </span>
                <span className="truncate text-[13px] font-bold text-foreground">
                  {hazardRep.name}
                </span>
                <span className="font-mono text-xs tabular-nums text-rose-300">
                  ({hazardRep.pipeAmt.toLocaleString('ru-RU')} ₽ в риске)
                </span>
              </div>
              <div className="mt-0.5 text-xs text-secondary">
                Балл речи:{' '}
                <strong className="font-medium text-rose-400">
                  {hazardRep.avgScore.toFixed(1)}/13
                </strong>{' '}
                • Сливов Next Step:{' '}
                <strong className="font-medium text-rose-400">
                  {100 - hazardRep.nextStepPct}% ({hazardRep.riskCallsCount}{' '}
                  звонков)
                </strong>
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onSelectRep?.(hazardRep.name);
            }}
            className="h-7 shrink-0 self-start border-rose-500/30 text-xs text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 sm:self-auto"
          >
            Разбор ({hazardRep.riskCallsCount} звонков)
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default RopPodium;

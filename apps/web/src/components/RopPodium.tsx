/**
 * apps/web/src/components/RopPodium.tsx
 *
 * ROP leaderboard: the top 3 managers by the average score of their RATED calls, and the manager who needs attention.
 * Managers are CRM users only; a missed call, a failed audit and an unrated call are not in any average
 * (lib/callStats.ts). A manager is ranked only from MIN_RATED_CALLS rated calls: fewer say nothing about a person.
 */

import * as React from 'react';
import { Crown, Trophy, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hasCrmManager, managerStats, ruPlural, type ManagerStats } from '@/lib/callStats';
import { MIN_RATED_CALLS, NEXT_STEP_MIN_PCT } from '@/lib/thresholds';
import type { Call } from '@/types/api';

export interface RopPodiumProps {
  calls?: Call[];
  onSelectRep?: (repName: string) => void;
  selectedRep?: string | null;
  className?: string;
}

const rub = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;

const scoreColor = (band: ManagerStats['band']) =>
  band === 'high' ? 'text-emerald-400' : band === 'mid' ? 'text-amber-400' : 'text-rose-400';

const nextStepColor = (p: number | null) =>
  p === null ? 'text-tertiary' : p >= NEXT_STEP_MIN_PCT ? 'text-emerald-400' : p > 0 ? 'text-amber-400' : 'text-rose-400';

export function RopPodium({ calls = [], onSelectRep, selectedRep, className }: RopPodiumProps) {
  const { team, ranked, hazardRep, unattributed } = React.useMemo(() => {
    const team = managerStats(calls);
    const ranked = team.filter((m) => m.enough);
    const hazardRep =
      [...ranked]
        .filter((m) => m.band === 'low')
        .sort((a, b) => (a.avgScore ?? 0) - (b.avgScore ?? 0) || b.lowCalls - a.lowCalls)[0] ?? null;
    return { team, ranked, hazardRep, unattributed: calls.filter((c) => !hasCrmManager(c)).length };
  }, [calls]);

  const shell = cn('surface space-y-2 rounded-xl border border-subtle p-6 text-center', className);
  const icon = (
    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-hover text-tertiary">
      <Trophy className="h-5 w-5" />
    </div>
  );

  if (team.length === 0) {
    return (
      <div className={shell} data-testid="rop-podium-empty">
        {icon}
        <h4 className="text-[13px] font-semibold text-foreground">Нет данных для пьедестала</h4>
        <p className="mx-auto max-w-md text-xs text-secondary">
          {unattributed > 0
            ? `Менеджер определяется по пользователю CRM, а у ${unattributed} ${ruPlural(unattributed, ['звонка', 'звонков', 'звонков'])} его нет.`
            : 'Требуются звонки менеджеров из CRM для формирования рейтинга эффективности.'}
        </p>
      </div>
    );
  }

  if (ranked.length === 0) {
    return (
      <div className={shell} data-testid="rop-podium-few">
        {icon}
        <h4 className="text-[13px] font-semibold text-foreground">Пока мало оценённых звонков</h4>
        <p className="mx-auto max-w-md text-xs text-secondary">
          Рейтинг строится от {MIN_RATED_CALLS} оценённых звонков на менеджера. Сейчас:{' '}
          {team.map((m) => `${m.name} — ${m.assessed}`).join(', ')}.
        </p>
      </div>
    );
  }

  const [top1, top2, top3] = ranked;

  const renderCard = (rep: ManagerStats | undefined, rank: number) => {
    if (!rep) return null;
    const isFirst = rank === 1;
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
            {rank} место{isFirst ? ' • лидер по баллу' : ''}
          </span>
          <span className="font-mono text-xs tabular-nums text-tertiary">
            {rep.assessed} {ruPlural(rep.assessed, ['оценён', 'оценены', 'оценено'])}
          </span>
        </div>

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
            <h4 className={cn('truncate text-sm font-bold', isFirst ? 'text-amber-300' : 'text-foreground')}>
              {rep.name}
            </h4>
            {rep.deals.count > 0 && (
              <div className="mt-0.5 text-xs text-secondary" title="Каждая сделка посчитана один раз, сколько бы по ней ни было звонков">
                Сделок в звонках:{' '}
                <span className="font-mono font-medium tabular-nums text-foreground">
                  {rep.deals.count}
                  {rep.deals.amount > 0 ? ` на ${rub(rep.deals.amount)}` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-background/50 space-y-2 rounded-lg border border-subtle p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-secondary">Качество речи:</span>
            <span className={cn('font-mono font-semibold tabular-nums', scoreColor(rep.band))}>
              {rep.avgScore === null ? '—' : rep.avgScore.toFixed(1)} / 13
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-secondary">Next Step:</span>
            <span className={cn('font-semibold tabular-nums', nextStepColor(rep.nextStepPct))}>
              {rep.nextStepPct === null ? '—' : `${rep.nextStepPct}% (${rep.nextStepDone} из ${rep.nextStepKnown})`}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn('space-y-4', className)} data-testid="rop-podium">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-subtle bg-hover text-foreground">
            <Trophy className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">Пьедестал РОПа и лидерборд</h3>
            <p className="text-xs text-secondary">
              Менеджеры из CRM по среднему баллу оценённых звонков (от {MIN_RATED_CALLS}). Недозвоны и сбои анализа не считаются.
            </p>
          </div>
        </div>
      </div>

      {/* Order: 2nd, 1st, 3rd */}
      <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-3">
        {renderCard(top2, 2)}
        {renderCard(top1, 1)}
        {renderCard(top3, 3)}
      </div>

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
                  Зона риска: средний балл ниже 6
                </span>
                <span className="truncate text-[13px] font-bold text-foreground">{hazardRep.name}</span>
              </div>
              <div className="mt-0.5 text-xs text-secondary">
                Балл речи:{' '}
                <strong className="font-medium text-rose-400">{hazardRep.avgScore?.toFixed(1)}/13</strong> • Срывов:{' '}
                <strong className="font-medium text-rose-400">
                  {hazardRep.lowCalls} из {hazardRep.assessed}
                </strong>
                {hazardRep.riskDeals.count > 0 && (
                  <>
                    {' '}
                    • Сделок под срывами:{' '}
                    <strong className="font-medium text-rose-400">
                      {hazardRep.riskDeals.count}
                      {hazardRep.riskDeals.amount > 0 ? ` на ${rub(hazardRep.riskDeals.amount)}` : ''}
                    </strong>
                  </>
                )}
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
            Разбор звонков
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default RopPodium;

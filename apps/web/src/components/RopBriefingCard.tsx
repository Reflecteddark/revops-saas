/**
 * apps/web/src/components/RopBriefingCard.tsx
 *
 * Briefing for the sales meeting, built from the audit by fixed rules (no AI is called here):
 * 1. the weakest criterion of the team;
 * 2. the manager to praise (best average of rated calls);
 * 3. the managers to coach (not "Эталон" by average).
 * Same counting as the podium and the heatmap (lib/callStats.ts): rated calls only. The weakest criterion is over every
 * rated call of the period (the KPI row's set); people (praise, coaching) are CRM managers with MIN_RATED_CALLS each.
 */

import * as React from 'react';
import { Sparkles, AlertTriangle, Trophy, UserX, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Call } from '@/types/api';
import { CR_DEFINITIONS } from '@/lib/criteria';
import { criterionRates, managerStats, ruPlural, summarizeCalls } from '@/lib/callStats';
import { MIN_RATED_CALLS } from '@/lib/thresholds';

export interface RopBriefingCardProps {
  calls?: Call[];
  onSelectRep?: (repName: string) => void;
  onSelectCriterion?: (crIndex: number) => void;
  className?: string;
}

const nextStep = (p: number | null) => (p === null ? 'Next Step: —' : `Next Step: ${p}%`);

export function RopBriefingCard({ calls = [], onSelectRep, onSelectCriterion, className }: RopBriefingCardProps) {
  const [copied, setCopied] = React.useState(false);

  const briefing = React.useMemo(() => {
    const { assessed } = summarizeCalls(calls);
    if (assessed === 0) return null;

    // 1. The weakest criterion: the lowest pass rate among the criteria that were assessed at all (first one on a tie)
    const worstCr = criterionRates(calls)
      .filter((r) => r.rate !== null)
      .reduce((worst, r) => (worst === null || (r.rate as number) < (worst.rate as number) ? r : worst), null as ReturnType<typeof criterionRates>[number] | null);
    if (!worstCr) return null;
    const worstCrDef = CR_DEFINITIONS[worstCr.index];

    // 2. + 3. People: only managers with enough rated calls
    const ranked = managerStats(calls).filter((m) => m.enough);
    const topRep = ranked[0] ?? null;
    const coachingCandidates = [...ranked]
      .filter((m) => m !== topRep && m.band !== 'high')
      .sort((a, b) => (a.avgScore ?? 0) - (b.avgScore ?? 0))
      .slice(0, 3);

    return { assessed, worstCr, worstCrDef, topRep, coachingCandidates, hasRanking: ranked.length > 0 };
  }, [calls]);

  const handleCopyAgenda = () => {
    if (!briefing) return;
    const { worstCr, worstCrDef, topRep, coachingCandidates, assessed } = briefing;
    const worstPct = Math.round((worstCr.rate as number) * 100);

    const coachingStr =
      coachingCandidates.length > 0
        ? coachingCandidates.map((c) => `• ${c.name} (${c.avgScore?.toFixed(1)}/13, ${nextStep(c.nextStepPct)})`).join('\n')
        : '• Нет менеджеров для разбора';

    const text = `⚡ Планёрка ОП — Фокус дня (RevOps):

🚨 Слабое место отдела:
${worstCrDef.label} (CR${worstCr.index + 1}) — соблюдается в ${worstPct}% оценённых звонков (${worstCr.assessed - worstCr.pass} из ${worstCr.assessed} без зачёта, всего оценено ${assessed}).

🏆 Кого похвалить:
${topRep ? `${topRep.name} — балл ${topRep.avgScore?.toFixed(1)}/13, ${nextStep(topRep.nextStepPct)}.` : '—'}

⚠️ Персональный разбор на планёрке:
${coachingStr}

👉 Задача дня: подтянуть критерий «${worstCrDef.label}».`;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (!briefing) {
    return (
      <div
        className={cn('surface rounded-xl border border-subtle p-5 text-center text-xs text-secondary', className)}
        data-testid="rop-briefing-empty"
      >
        <Sparkles className="mx-auto mb-2 h-6 w-6 text-primary" />
        <div className="font-semibold text-foreground">Фокус дня</div>
        <p className="mt-1 text-tertiary">
          Повестка планёрки появится, когда будут оценённые звонки менеджеров из CRM.
        </p>
      </div>
    );
  }

  const { assessed, worstCr, worstCrDef, topRep, coachingCandidates, hasRanking } = briefing;
  const passPct = Math.round((worstCr.rate as number) * 100);

  return (
    <div
      className={cn('surface flex flex-col justify-between space-y-4 rounded-xl border border-subtle p-5 shadow-sm', className)}
      data-testid="rop-briefing-card"
    >
      <div className="flex items-center justify-between border-b border-subtle pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">⚡ Фокус дня для планёрки РОПа</h3>
            <p className="text-[11px] text-tertiary">
              По {assessed} {ruPlural(assessed, ['оценённому звонку', 'оценённым звонкам', 'оценённым звонкам'])} за выбранный период
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

      <div className="space-y-3">
        {/* 1. Systemic weakness */}
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
            <span>Слабое место отдела:</span>
          </div>
          <div className="mt-1 text-[13px] font-bold text-foreground">
            {worstCrDef.label}{' '}
            <span className="font-mono text-xs font-semibold text-rose-500">(CR{worstCr.index + 1})</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-secondary">
            Соблюдается в <span className="font-bold text-rose-500">{passPct}%</span> оценённых звонков (
            {worstCr.assessed - worstCr.pass} из {worstCr.assessed} без зачёта).
          </p>
        </div>

        {/* 2. Top performer */}
        {topRep && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelectRep?.(topRep.name)}
            onKeyDown={(e) => e.key === 'Enter' && onSelectRep?.(topRep.name)}
            className="group cursor-pointer rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10"
            title="Кликните, чтобы показать звонки менеджера"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Trophy className="h-3.5 w-3.5 shrink-0" />
              <span>Кого похвалить на планёрке:</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-[13px] font-bold text-foreground">{topRep.name}</span>
              <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {topRep.avgScore?.toFixed(1)} / 13
              </span>
            </div>
            <p className="mt-1 text-[11px] text-secondary">
              {nextStep(topRep.nextStepPct)} • Лучший средний балл в команде ({topRep.assessed}{' '}
              {ruPlural(topRep.assessed, ['звонок', 'звонка', 'звонков'])}).
            </p>
          </div>
        )}

        {/* 3. Coaching */}
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
                  <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">({c.avgScore?.toFixed(1)})</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-tertiary">
              Менеджеры, чей средний балл ниже эталона (9). Кликните на имя, чтобы увидеть его звонки.
            </p>
          </div>
        )}

        {!hasRanking && (
          <p className="rounded-lg border border-subtle bg-hover/40 p-3 text-[11px] text-tertiary" data-testid="briefing-few-calls">
            Кого хвалить и кого разбирать, станет понятно от {MIN_RATED_CALLS} оценённых звонков на менеджера.
          </p>
        )}
      </div>
    </div>
  );
}

export default RopBriefingCard;

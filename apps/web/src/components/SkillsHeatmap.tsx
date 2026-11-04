/**
 * apps/web/src/components/SkillsHeatmap.tsx
 *
 * Sales reps skills heatmap (CR1..CR13): the pass rate of every criterion per manager.
 * - a rate is over the calls where THIS criterion was really assessed; a real 0% is red "0%", "—" means no data;
 * - managers are CRM users, missed calls and failed audits are not assessed (lib/callStats.ts);
 * - traffic light: <50% red, 50-79% amber, 80-100% green; click a cell to see the calls that failed it.
 */

import * as React from 'react';
import { Users, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Call } from '@/types/api';
import { CR_DEFINITIONS, CR_SHORT_LABELS } from '@/lib/criteria';
import {
  criterionRates,
  hasCrmManager,
  managerStats,
  ruPlural,
  summarizeCalls,
  type CriterionRate,
  type ManagerStats,
} from '@/lib/callStats';
import { CALL_SCORE_THRESHOLDS, MIN_RATED_CALLS } from '@/lib/thresholds';

export interface SkillsHeatmapProps {
  calls?: Call[];
  onSelectRep?: (repName: string) => void;
  onSelectCell?: (repName: string, criterionIndex: number) => void;
  selectedRep?: string | null;
  selectedCriterion?: number | null;
  className?: string;
}

export const CRITERIA_SHORT_NAMES: string[] = CR_SHORT_LABELS;

export interface RepSkillSummary extends ManagerStats {
  role: string;
  roleType: 'top' | 'norm' | 'risk' | 'few';
  criteriaRates: CriterionRate[];
}

function roleOf(m: ManagerStats): Pick<RepSkillSummary, 'role' | 'roleType'> {
  if (m.assessed === 0) return { role: 'Нет оценённых звонков', roleType: 'few' };
  if (!m.enough) return { role: `Мало данных: ${m.assessed} из ${MIN_RATED_CALLS}`, roleType: 'few' };
  if (m.band === 'high') return { role: 'Эталон звонков', roleType: 'top' };
  if (m.band === 'low') return { role: 'Зона риска', roleType: 'risk' };
  return { role: 'Норматив', roleType: 'norm' };
}

export function SkillsHeatmap({
  calls = [],
  onSelectRep,
  onSelectCell,
  selectedRep,
  selectedCriterion,
  className,
}: SkillsHeatmapProps) {
  const { repsData, unattributed, summary } = React.useMemo(() => {
    const reps: RepSkillSummary[] = managerStats(calls).map((m) => ({
      ...m,
      ...roleOf(m),
      criteriaRates: criterionRates(calls.filter((c) => hasCrmManager(c) && c.manager.trim() === m.name)),
    }));
    return {
      repsData: reps,
      unattributed: calls.filter((c) => !hasCrmManager(c)).length,
      summary: summarizeCalls(calls),
    };
  }, [calls]);

  if (repsData.length === 0) {
    return (
      <div
        className={cn('surface space-y-2 rounded-xl border border-subtle p-6 text-center', className)}
        data-testid="skills-heatmap-empty"
      >
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-hover text-tertiary">
          <Users className="h-5 w-5" />
        </div>
        <h4 className="text-[13px] font-semibold text-foreground">Нет данных о менеджерах</h4>
        <p className="mx-auto max-w-sm text-xs text-secondary">
          {unattributed > 0
            ? `Менеджер определяется по пользователю CRM, а у ${unattributed} ${ruPlural(unattributed, ['звонка', 'звонков', 'звонков'])} его нет.`
            : 'Ожидание звонков из телефонии для автоматического построения тепловой матрицы навыков.'}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn('surface flex flex-col justify-between space-y-3 rounded-xl border border-subtle p-5 shadow-sm', className)}
      data-testid="skills-heatmap"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-subtle bg-hover text-foreground">
            <Award className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Тепловая карта навыков ОП (CR1 – CR13)</h3>
            <p className="text-xs text-secondary">
              Доля оценённых звонков, где критерий выполнен • Кликните на ячейку, чтобы увидеть звонки с провалом
            </p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-full border border-subtle bg-hover px-2.5 py-1 text-[11px] font-semibold tabular-nums text-secondary">
          Менеджеров в анализе: <span className="ml-1 text-foreground">{repsData.length}</span>
        </span>
      </div>

      <div className="hidden items-center justify-between gap-3 px-3 text-[10px] font-semibold text-tertiary md:flex">
        <div className="min-w-[190px] shrink-0 uppercase tracking-wider">Менеджер / Статус</div>
        <div className="flex flex-1 items-center justify-center gap-1.5 px-1">
          {CR_DEFINITIONS.map((cr, idx) => (
            <div
              key={cr.id}
              className="flex w-[26px] cursor-help flex-col items-center justify-center text-center transition-colors hover:text-foreground"
              title={`${cr.label} (CR${idx + 1}): ${cr.description}`}
            >
              <span className="font-mono text-[10px]">C{idx + 1}</span>
            </div>
          ))}
        </div>
        <div className="w-[50px] shrink-0 text-right uppercase tracking-wider">Балл</div>
      </div>

      <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
        {repsData.map((rep) => {
          const isSelected = selectedRep === rep.name;
          const scoreColor =
            rep.avgScore === null
              ? 'text-tertiary'
              : rep.avgScore >= CALL_SCORE_THRESHOLDS.high.min
                ? 'text-emerald-500 dark:text-emerald-400'
                : rep.avgScore >= CALL_SCORE_THRESHOLDS.mid.min
                  ? 'text-amber-500 dark:text-amber-400'
                  : 'text-rose-500 dark:text-rose-400';

          return (
            <div
              key={rep.name}
              role="button"
              tabIndex={0}
              onClick={() => onSelectRep?.(rep.name)}
              onKeyDown={(e) => e.key === 'Enter' && onSelectRep?.(rep.name)}
              className={cn(
                'group flex cursor-pointer flex-col justify-between gap-3 rounded-lg border p-2.5 transition-all md:flex-row md:items-center',
                isSelected ? 'border-primary/50 bg-primary/10 shadow-sm' : 'bg-hover/30 hover:bg-hover/60 border-subtle'
              )}
              data-testid={`skill-row-${rep.name}`}
            >
              <div className="flex min-w-[190px] shrink-0 items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-hover text-xs font-bold text-foreground">
                  {rep.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-foreground">{rep.name}</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-tertiary">
                    <span>
                      {rep.total} {ruPlural(rep.total, ['звонок', 'звонка', 'звонков'])}
                    </span>
                    <span>•</span>
                    <span
                      title={
                        rep.roleType === 'few'
                          ? `Роль присваивается от ${MIN_RATED_CALLS} оценённых звонков`
                          : `Средний балл ${rep.avgScore?.toFixed(1)}/13 по ${rep.assessed} оценённым`
                      }
                      className={cn(
                        'font-medium',
                        rep.roleType === 'top'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : rep.roleType === 'risk'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-secondary'
                      )}
                    >
                      {rep.role}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-wrap items-center justify-start gap-1.5 px-1 md:justify-center">
                {rep.criteriaRates.map((cr) => {
                  const crDef = CR_DEFINITIONS[cr.index];
                  const pct = cr.rate === null ? null : Math.round(cr.rate * 100);
                  const title =
                    `${crDef?.label || `CR${cr.index + 1}`} (CR${cr.index + 1}): ` +
                    (pct === null ? 'нет оценённых звонков' : `${pct}% (${cr.pass} из ${cr.assessed} оценённых)`) +
                    '\nКликните для фильтрации звонков с провалом';
                  const isCellSelected = isSelected && selectedCriterion === cr.index;

                  let bgStyle = 'bg-hover/60 border border-subtle text-tertiary'; // no data
                  if (cr.rate !== null) {
                    bgStyle =
                      cr.rate >= 0.8
                        ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold'
                        : cr.rate >= 0.5
                          ? 'border border-amber-500/30 bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium'
                          : 'border border-rose-500/40 bg-rose-500/25 text-rose-600 dark:text-rose-400 font-bold';
                  }

                  return (
                    <button
                      key={cr.index}
                      type="button"
                      title={title}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectCell) onSelectCell(rep.name, cr.index);
                        else onSelectRep?.(rep.name);
                      }}
                      className={cn(
                        'flex h-6 w-[26px] shrink-0 items-center justify-center rounded font-mono text-[10px] tabular-nums transition-transform hover:scale-110 focus:outline-none',
                        bgStyle,
                        isCellSelected && 'ring-2 ring-primary ring-offset-1'
                      )}
                    >
                      {pct === null ? '—' : `${pct}%`}
                    </button>
                  );
                })}
              </div>

              <div className="shrink-0 pl-2 text-right">
                <div className={cn('font-mono text-sm font-bold tabular-nums', scoreColor)}>
                  {rep.avgScore === null ? '—' : rep.avgScore.toFixed(1)}
                </div>
                <div className="text-[10px] text-tertiary">из 13</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-subtle pt-2 text-[11px] text-tertiary">
        <div className="space-y-0.5" data-testid="heatmap-excluded">
          {unattributed > 0 && (
            <div>
              Без менеджера из CRM: {unattributed} {ruPlural(unattributed, ['звонок', 'звонка', 'звонков'])} — в рейтингах менеджеров
              не участвуют
            </div>
          )}
          {summary.unanswered + summary.failed > 0 && (
            <div>
              Оценки нет: недозвонов {summary.unanswered}, сбоев анализа {summary.failed}
            </div>
          )}
          {unattributed === 0 && summary.unanswered + summary.failed === 0 && <div>Все звонки учтены</div>}
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>≥80% норма</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>50-79% внимание</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            <span>&lt;50% провал</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-zinc-500/50" />
            <span>— нет данных</span>
          </span>
        </div>
      </div>
    </div>
  );
}

export default SkillsHeatmap;

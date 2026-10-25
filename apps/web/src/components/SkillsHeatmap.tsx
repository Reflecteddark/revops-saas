/**
 * apps/web/src/components/SkillsHeatmap.tsx
 *
 * Sales Reps Skills Heatmap widget (CR1..CR13).
 * Visualizes criterion compliance matrix for every manager,
 * identifying speech patterns, weak stages, and top performers.
 */

import * as React from 'react';
import { Users, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Call } from '@/types/api';

export interface SkillsHeatmapProps {
  calls?: Call[];
  onSelectRep?: (repName: string) => void;
  selectedRep?: string | null;
  className?: string;
}

export const CRITERIA_SHORT_NAMES: string[] = [
  'Контакт',
  'Программа',
  'Квалификация',
  'Боли',
  'Презентация',
  'Возражения',
  'Next Step',
  'Инициатива',
  'Экспертность',
  'Чистота речи',
  'Дедлайн',
  'Бюджет',
  'Финал',
];

export interface RepSkillSummary {
  name: string;
  callsCount: number;
  avgScore: number;
  role: string;
  roleType: 'top' | 'norm' | 'risk';
  criteriaRates: { index: number; passCount: number; rate: number }[];
}

export function SkillsHeatmap({
  calls = [],
  onSelectRep,
  selectedRep,
  className,
}: SkillsHeatmapProps) {
  const repsData: RepSkillSummary[] = React.useMemo(() => {
    if (!calls || calls.length === 0) return [];

    const map = new Map<string, Call[]>();
    calls.forEach((c) => {
      const name = (c.manager || 'Менеджер').trim();
      if (!map.has(name)) {
        map.set(name, []);
      }
      map.get(name)!.push(c);
    });

    const summaries: RepSkillSummary[] = [];

    map.forEach((repCalls, name) => {
      const count = repCalls.length;
      const scoreSum = repCalls.reduce((acc, c) => acc + (c.score || 0), 0);
      const avgScore = count > 0 ? scoreSum / count : 0;

      const criteriaRates = Array.from({ length: 13 }).map((_, idx) => {
        let passCount = 0;
        repCalls.forEach((c) => {
          if (c.cr && c.cr[idx] === 1) passCount += 1;
        });
        const rate = count > 0 ? passCount / count : 0;
        return { index: idx, passCount, rate };
      });

      let role = 'Норматив';
      let roleType: 'top' | 'norm' | 'risk' = 'norm';
      if (avgScore >= 10.5) {
        role = 'Эталон звонков';
        roleType = 'top';
      } else if (avgScore < 8.0) {
        role = 'Зона риска';
        roleType = 'risk';
      }

      summaries.push({
        name,
        callsCount: count,
        avgScore,
        role,
        roleType,
        criteriaRates,
      });
    });

    return summaries.sort((a, b) => b.avgScore - a.avgScore);
  }, [calls]);

  if (repsData.length === 0) {
    return (
      <div
        className={cn(
          'surface space-y-2 rounded-xl border border-subtle p-6 text-center',
          className
        )}
        data-testid="skills-heatmap-empty"
      >
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-subtle bg-hover text-tertiary">
          <Users className="h-5 w-5" />
        </div>
        <h4 className="text-[13px] font-semibold text-foreground">
          Нет данных о менеджерах
        </h4>
        <p className="mx-auto max-w-sm text-xs text-secondary">
          Ожидание звонков из телефонии для автоматического построения тепловой
          матрицы навыков.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'surface space-y-4 rounded-xl border border-subtle p-5',
        className
      )}
      data-testid="skills-heatmap"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-subtle bg-hover text-foreground">
            <Award className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">
              Тепловая карта навыков ОП (CR1 – CR13)
            </h3>
            <p className="text-xs text-secondary">
              Соблюдение стандартов скрипта и конверсионных триггеров по
              менеджерам
            </p>
          </div>
        </div>
        <span className="inline-flex items-center rounded-full border border-subtle bg-hover px-2.5 py-1 text-[11px] font-semibold tabular-nums text-secondary">
          Менеджеров в обороте:{' '}
          <span className="ml-1 text-foreground">{repsData.length}</span>
        </span>
      </div>

      {/* Matrix Table */}
      <div className="space-y-2 overflow-x-auto pt-1">
        {repsData.map((rep) => {
          const isSelected = selectedRep === rep.name;
          const scoreColor =
            rep.avgScore >= 9.0
              ? 'text-emerald-400'
              : rep.avgScore >= 6.0
                ? 'text-amber-400'
                : 'text-rose-400';

          return (
            <div
              key={rep.name}
              role="button"
              tabIndex={0}
              onClick={() => onSelectRep?.(rep.name)}
              onKeyDown={(e) => e.key === 'Enter' && onSelectRep?.(rep.name)}
              className={cn(
                'group flex cursor-pointer flex-col justify-between gap-3 rounded-lg border p-3 transition-all md:flex-row md:items-center',
                isSelected
                  ? 'border-violet-500/40 bg-violet-500/10'
                  : 'bg-hover/30 hover:bg-hover/60 border-subtle'
              )}
              data-testid={`skill-row-${rep.name}`}
            >
              {/* Rep Info */}
              <div className="flex min-w-[200px] items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-subtle bg-hover text-xs font-bold text-foreground">
                  {rep.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-foreground">
                    {rep.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-tertiary">
                    <span>
                      {rep.callsCount}{' '}
                      {rep.callsCount === 1 ? 'звонок' : 'звонков'}
                    </span>
                    <span>•</span>
                    <span
                      className={cn(
                        'font-medium',
                        rep.roleType === 'top'
                          ? 'text-emerald-400'
                          : rep.roleType === 'risk'
                            ? 'text-rose-400'
                            : 'text-secondary'
                      )}
                    >
                      {rep.role}
                    </span>
                  </div>
                </div>
              </div>

              {/* 13 Heat Chips */}
              <div className="flex flex-1 flex-wrap items-center justify-start gap-1.5 px-1 md:justify-center">
                {rep.criteriaRates.map((cr) => {
                  const pct = Math.round(cr.rate * 100);
                  const shortName =
                    CRITERIA_SHORT_NAMES[cr.index] || `CR${cr.index + 1}`;
                  const title = `${shortName} (CR${cr.index + 1}): ${pct}% (${cr.passCount}/${rep.callsCount})`;

                  const bgStyle =
                    cr.rate >= 0.75
                      ? 'bg-emerald-500/80 text-emerald-950 font-semibold'
                      : cr.rate >= 0.5
                        ? 'bg-emerald-500/40 text-foreground'
                        : cr.rate >= 0.25
                          ? 'bg-amber-500/40 text-foreground'
                          : cr.rate > 0
                            ? 'bg-rose-500/40 text-foreground'
                            : 'bg-hover border border-subtle text-tertiary';

                  return (
                    <div
                      key={cr.index}
                      title={title}
                      className={cn(
                        'flex h-6 min-w-[22px] items-center justify-center rounded px-1 font-mono text-[10px] tabular-nums transition-transform group-hover:scale-105',
                        bgStyle
                      )}
                    >
                      {pct > 0 ? `${pct}%` : '—'}
                    </div>
                  );
                })}
              </div>

              {/* Rep Score */}
              <div className="shrink-0 pl-2 text-right">
                <div
                  className={cn(
                    'font-mono text-base font-bold tabular-nums',
                    scoreColor
                  )}
                >
                  {rep.avgScore.toFixed(1)}
                </div>
                <div className="text-[10px] text-tertiary">из 13 баллов</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SkillsHeatmap;

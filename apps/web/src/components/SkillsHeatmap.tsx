/**
 * apps/web/src/components/SkillsHeatmap.tsx
 *
 * Sales Reps Skills Heatmap widget (CR1..CR13).
 * Visualizes criterion compliance matrix for every manager with:
 * - Clear sticky header showing CR1..CR13 short titles & tooltips
 * - Strict B2B traffic-light color grading (<50% RED alert, 50-79% AMBER, 80-100% GREEN)
 * - Exclusion of IVR/bots from sales ranking
 * - Controlled viewport height with smooth scroll to eliminate layout gaps
 * - Direct cell click-through to filtered calls inspection (drill-down)
 */

import * as React from 'react';
import { Users, Award, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Call } from '@/types/api';
import { CR_DEFINITIONS, CR_SHORT_LABELS } from '@/lib/criteria';

export interface SkillsHeatmapProps {
  calls?: Call[];
  onSelectRep?: (repName: string) => void;
  onSelectCell?: (repName: string, criterionIndex: number) => void;
  selectedRep?: string | null;
  selectedCriterion?: number | null;
  className?: string;
}

export const CRITERIA_SHORT_NAMES: string[] = CR_SHORT_LABELS;

export interface RepSkillSummary {
  name: string;
  callsCount: number;
  avgScore: number;
  role: string;
  roleType: 'top' | 'norm' | 'risk';
  criteriaRates: { index: number; passCount: number; rate: number }[];
}

const SYSTEM_BOT_NAMES = new Set([
  'Автоответчик',
  'Недозвон',
  'Не представился',
  'Неизвестный',
  '-',
]);

export function SkillsHeatmap({
  calls = [],
  onSelectRep,
  onSelectCell,
  selectedRep,
  selectedCriterion,
  className,
}: SkillsHeatmapProps) {
  // Separate real managers from bots/IVR
  const { repsData, botCallsCount } = React.useMemo(() => {
    if (!calls || calls.length === 0) {
      return { repsData: [], botCallsCount: 0 };
    }

    const map = new Map<string, Call[]>();
    let botCount = 0;

    calls.forEach((c) => {
      const name = (c.manager || 'Менеджер').trim();
      if (SYSTEM_BOT_NAMES.has(name)) {
        botCount += 1;
        return;
      }
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

    return {
      repsData: summaries.sort((a, b) => b.avgScore - a.avgScore),
      botCallsCount: botCount,
    };
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
        'surface flex flex-col justify-between space-y-3 rounded-xl border border-subtle p-5 shadow-sm',
        className
      )}
      data-testid="skills-heatmap"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-subtle bg-hover text-foreground">
            <Award className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                Тепловая карта навыков ОП (CR1 – CR13)
              </h3>
              <span className="hidden items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-500 sm:inline-flex">
                &lt;50% = Слив
              </span>
            </div>
            <p className="text-xs text-secondary">
              Соблюдение конверсионных триггеров • Кликните на ячейку для разбора звонков
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-subtle bg-hover px-2.5 py-1 text-[11px] font-semibold tabular-nums text-secondary">
            Менеджеров в анализе:{' '}
            <span className="ml-1 text-foreground">{repsData.length}</span>
          </span>
        </div>
      </div>

      {/* Criteria Column Headers Bar */}
      <div className="hidden items-center justify-between gap-3 px-3 text-[10px] font-semibold text-tertiary md:flex">
        <div className="min-w-[190px] shrink-0 uppercase tracking-wider">
          Менеджер / Статус
        </div>
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
        <div className="w-[50px] shrink-0 text-right uppercase tracking-wider">
          Балл
        </div>
      </div>

      {/* Scrollable Matrix Table Body */}
      <div className="max-h-[500px] space-y-2 overflow-y-auto pr-1">
        {repsData.map((rep) => {
          const isSelected = selectedRep === rep.name;
          const scoreColor =
            rep.avgScore >= 9.0
              ? 'text-emerald-500 dark:text-emerald-400'
              : rep.avgScore >= 6.0
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
                isSelected
                  ? 'border-primary/50 bg-primary/10 shadow-sm'
                  : 'bg-hover/30 hover:bg-hover/60 border-subtle'
              )}
              data-testid={`skill-row-${rep.name}`}
            >
              {/* Rep Info */}
              <div className="flex min-w-[190px] shrink-0 items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-hover text-xs font-bold text-foreground">
                  {rep.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-foreground">
                    {rep.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-tertiary">
                    <span>
                      {rep.callsCount}{' '}
                      {rep.callsCount === 1 ? 'звонок' : 'звонков'}
                    </span>
                    <span>•</span>
                    <span
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

              {/* 13 Heat Chips with strict B2B traffic light */}
              <div className="flex flex-1 flex-wrap items-center justify-start gap-1.5 px-1 md:justify-center">
                {rep.criteriaRates.map((cr) => {
                  const pct = Math.round(cr.rate * 100);
                  const crDef = CR_DEFINITIONS[cr.index];
                  const title = `${crDef?.label || `CR${cr.index + 1}`} (CR${cr.index + 1}): ${pct}% (${cr.passCount}/${rep.callsCount})\nКликните для фильтрации звонков с ошибкой`;

                  const isCellSelected =
                    isSelected && selectedCriterion === cr.index;

                  // Strict B2B Traffic Light grading:
                  // <50%: Critical failure / leak (RED)
                  // 50..79%: Warning / floating skill (AMBER)
                  // 80..100%: Mastered skill (GREEN)
                  let bgStyle = 'bg-hover/60 border border-subtle text-tertiary';
                  if (cr.rate >= 0.8) {
                    bgStyle =
                      'border border-emerald-500/30 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-semibold';
                  } else if (cr.rate >= 0.5) {
                    bgStyle =
                      'border border-amber-500/30 bg-amber-500/20 text-amber-600 dark:text-amber-400 font-medium';
                  } else if (cr.rate > 0) {
                    bgStyle =
                      'border border-rose-500/40 bg-rose-500/25 text-rose-600 dark:text-rose-400 font-bold';
                  }

                  return (
                    <button
                      key={cr.index}
                      type="button"
                      title={title}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectCell) {
                          onSelectCell(rep.name, cr.index);
                        } else {
                          onSelectRep?.(rep.name);
                        }
                      }}
                      className={cn(
                        'flex h-6 w-[26px] shrink-0 items-center justify-center rounded font-mono text-[10px] tabular-nums transition-transform hover:scale-110 focus:outline-none',
                        bgStyle,
                        isCellSelected && 'ring-2 ring-primary ring-offset-1'
                      )}
                    >
                      {pct > 0 ? `${pct}%` : '—'}
                    </button>
                  );
                })}
              </div>

              {/* Rep Score */}
              <div className="shrink-0 pl-2 text-right">
                <div
                  className={cn(
                    'font-mono text-sm font-bold tabular-nums',
                    scoreColor
                  )}
                >
                  {rep.avgScore.toFixed(1)}
                </div>
                <div className="text-[10px] text-tertiary">из 13</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Info / Bot Calls Summary */}
      {botCallsCount > 0 && (
        <div className="flex items-center justify-between border-t border-subtle pt-2 text-[11px] text-tertiary">
          <div className="flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-secondary" />
            <span>
              Исключены технические вызовы (IVR, спам, сброс):{' '}
              <strong className="text-secondary">{botCallsCount}</strong>
            </span>
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
              <span>&lt;50% слив</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SkillsHeatmap;

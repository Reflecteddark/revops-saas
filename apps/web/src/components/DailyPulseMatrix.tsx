﻿/**
 * apps/web/src/components/DailyPulseMatrix.tsx
 *
 * MPSTATS-style "Рука на пульсе" daily heatmap matrix with inline SVG sparklines,
 * soft pastel risk/quality cell tinting, and manager performance breakdown.
 */

import * as React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Flame,
  Search,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { isSystemName } from '@/lib/systemNames';
import { CALL_SCORE_THRESHOLDS } from '@/lib/thresholds';
import type { Call } from '@/types/api';

export interface DayMetric {
  dateStr: string; // "24 окт"
  dayOfWeek: string; // "Пт"
  callsCount: number;
  avgScore: number;
  nextStepPct: number;
}

export interface ManagerRowData {
  id: string;
  name: string;
  role: string;
  days: DayMetric[];
  totalCalls: number;
  avgScore: number;
  nextStepPct: number;
}

export interface DailyPulseMatrixProps {
  calls: Call[];
  managers?: (string | { name?: string; id?: string; role?: string })[];
  loading?: boolean;
  onInspectCall?: (call: Call) => void;
  className?: string;
}

// Helper to format last 7 days ending today
function getLast7Days(): { dateStr: string; dayOfWeek: string; isoDate: string }[] {
  const daysShort = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const monthsShort = [
    'янв', 'фев', 'мар', 'апр', 'май', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
  ];

  const result = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    result.push({
      dateStr: `${d.getDate()} ${monthsShort[d.getMonth()]}`,
      dayOfWeek: daysShort[d.getDay()],
      isoDate: d.toISOString().slice(0, 10),
    });
  }

  return result;
}

// Inline SVG Sparkline component (vertical micro-bars)
function InlineSparkline({
  days,
  metricMode,
}: {
  days: DayMetric[];
  metricMode: 'calls' | 'score' | 'next_step';
}) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  const values = days.map((d) =>
    metricMode === 'calls'
      ? d.callsCount
      : metricMode === 'score'
      ? d.avgScore
      : d.nextStepPct
  );
  const maxVal = Math.max(1, ...values);

  const barWidth = 6;
  const barGap = 2;
  const height = 24;

  return (
    <div className="relative inline-flex items-center">
      <svg
        width={days.length * (barWidth + barGap)}
        height={height}
        className="overflow-visible"
      >
        {days.map((d, i) => {
          const val = values[i];
          const barHeight = Math.max(3, Math.round((val / maxVal) * (height - 4)));
          const y = height - barHeight;
          const x = i * (barWidth + barGap);

          const isGood = d.avgScore >= CALL_SCORE_THRESHOLDS.high.min;
          const isMid = d.avgScore >= CALL_SCORE_THRESHOLDS.mid.min;
          const fill =
            d.callsCount === 0
              ? 'rgba(244, 63, 94, 0.35)'
              : isGood
              ? '#10b981'
              : isMid
              ? '#f59e0b'
              : '#f43f5e';

          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={1.5}
              fill={fill}
              className="cursor-pointer transition-opacity hover:opacity-75"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          );
        })}
      </svg>

      {hoveredIdx !== null && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-[10px] font-mono shadow-md border border-subtle text-foreground pointer-events-none">
          {days[hoveredIdx].dateStr}: {days[hoveredIdx].callsCount} зв,{' '}
          {days[hoveredIdx].avgScore > 0 ? `${days[hoveredIdx].avgScore}/13` : '0'}
        </div>
      )}
    </div>
  );
}

export function DailyPulseMatrix({
  calls,
  managers = [],
  loading = false,
  className,
}: DailyPulseMatrixProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [metricMode, setMetricMode] = React.useState<'calls' | 'score' | 'next_step'>('calls');
  const [groupExpanded, setGroupExpanded] = React.useState(true);

  const last7Days = React.useMemo(() => getLast7Days(), []);

  // Compute managers and day metrics strictly from factual calls and registered team managers (Zero Mock)
  const managerRows: ManagerRowData[] = React.useMemo(() => {
    const fromCalls = calls.map((c) => c.manager).filter(Boolean);
    const fromManagers = (managers || [])
      .map((m) => (typeof m === 'string' ? m : m?.name))
      .filter(Boolean);
    const managerNames = Array.from(new Set([...fromCalls, ...fromManagers])).filter((name) => !isSystemName(name)) as string[];

    if (managerNames.length === 0) {
      return [];
    }

    return managerNames.map((mgrName, mgrIdx) => {
      const mgrConfig = (managers || []).find((m) =>
        (typeof m === 'string' ? m : m?.name) === mgrName
      );
      const roleStr =
        typeof mgrConfig === 'object' && mgrConfig?.role
          ? mgrConfig.role
          : 'Менеджер ОП';

      const mgrCalls = calls.filter((c) => c.manager === mgrName);

      const days: DayMetric[] = last7Days.map((d) => {
        const callsOnDay = mgrCalls.filter((c) => {
          const callDate = c.date || c.created_at || '';
          return callDate.includes(d.isoDate);
        });

        const count = callsOnDay.length;
        const totalScore = callsOnDay.reduce((acc, c) => acc + (c.score || 0), 0);
        const avg = count > 0 ? Math.round((totalScore / count) * 10) / 10 : 0;
        const nextStepCount = callsOnDay.filter(
          (c) => c.zoom_scheduled || (c.cr && c.cr[6] === 1) || c.status === 'won'
        ).length;
        const nextStepPct = count > 0 ? Math.round((nextStepCount / count) * 100) : 0;

        return {
          dateStr: d.dateStr,
          dayOfWeek: d.dayOfWeek,
          callsCount: count,
          avgScore: avg,
          nextStepPct,
        };
      });

      const totalCalls = days.reduce((acc, d) => acc + d.callsCount, 0);
      const totalScoreSum = days.reduce((acc, d) => acc + d.avgScore * d.callsCount, 0);
      const avgScore =
        totalCalls > 0 ? Math.round((totalScoreSum / totalCalls) * 10) / 10 : 0;
      const totalNextStepCount = days.reduce(
        (acc, d) => acc + Math.round((d.nextStepPct * d.callsCount) / 100),
        0
      );
      const nextStepPct =
        totalCalls > 0 ? Math.round((totalNextStepCount / totalCalls) * 100) : 0;

      return {
        id: `mgr-${mgrIdx}`,
        name: mgrName,
        role: roleStr,
        days,
        totalCalls,
        avgScore,
        nextStepPct,
      };
    });
  }, [calls, managers, last7Days]);

  const filteredManagers = managerRows.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div
      className={cn(
        'surface rounded-xl border border-subtle overflow-hidden space-y-0 shadow-sm',
        className
      )}
      data-testid="daily-pulse-matrix"
    >
      {/* Matrix Header & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-subtle bg-surface">
        <div className="flex items-center space-x-2.5">
          <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500 border border-emerald-500/20">
            <Flame className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">
                Рука на пульсе: Дневная матрица активности и качества
              </h2>
              <Badge variant="outline" className="text-[10px] font-mono border-subtle">
                7 дней
              </Badge>
            </div>
            <p className="text-[11px] text-tertiary">
              Микро-графики распределения и тепловая подсветка аномалий ОП
            </p>
          </div>
        </div>

        {/* View Mode Switcher Pills */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-subtle bg-hover/50 p-0.5 text-xs">
            <button
              onClick={() => setMetricMode('calls')}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                metricMode === 'calls'
                  ? 'bg-surface text-foreground shadow-sm font-semibold'
                  : 'text-secondary hover:text-foreground'
              )}
            >
              Звонки
            </button>
            <button
              onClick={() => setMetricMode('score')}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                metricMode === 'score'
                  ? 'bg-surface text-foreground shadow-sm font-semibold'
                  : 'text-secondary hover:text-foreground'
              )}
            >
              Баллы (CR)
            </button>
            <button
              onClick={() => setMetricMode('next_step')}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                metricMode === 'next_step'
                  ? 'bg-surface text-foreground shadow-sm font-semibold'
                  : 'text-secondary hover:text-foreground'
              )}
            >
              Next Step %
            </button>
          </div>

          <div className="relative w-40 sm:w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-tertiary" />
            <Input
              type="text"
              placeholder="Менеджер..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-2 text-xs bg-hover/50 border-subtle rounded-lg placeholder:text-tertiary"
            />
          </div>
        </div>
      </div>

      {/* Main Heatmap Data Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-subtle bg-hover/40 text-[11px] uppercase tracking-wider text-tertiary select-none">
              <th className="py-2.5 px-4 font-semibold w-56">Менеджер ОП</th>
              <th className="py-2.5 px-3 font-semibold text-center w-24">График</th>
              <th className="py-2.5 px-3 font-semibold text-center w-20">Итого</th>
              {last7Days.map((d, idx) => (
                <th key={idx} className="py-2.5 px-3 font-semibold text-center min-w-[76px]">
                  <div className="text-foreground">{d.dateStr}</div>
                  <div className="text-[10px] text-tertiary font-mono lowercase">
                    {d.dayOfWeek}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, rIdx) => (
                <tr key={rIdx} className="border-b border-subtle">
                  <td className="p-3"><Skeleton className="h-4 w-32" /></td>
                  <td className="p-3"><Skeleton className="h-4 w-16 mx-auto" /></td>
                  <td className="p-3"><Skeleton className="h-4 w-12 mx-auto" /></td>
                  {Array.from({ length: 7 }).map((__, cIdx) => (
                    <td key={cIdx} className="p-3"><Skeleton className="h-6 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : (
              <>
                {/* Group Accordion Header */}
                <tr
                  onClick={() => setGroupExpanded(!groupExpanded)}
                  className="bg-hover/20 border-b border-subtle cursor-pointer hover:bg-hover/50 transition-colors select-none"
                >
                  <td colSpan={10} className="py-2 px-4">
                    <div className="flex items-center space-x-2 text-xs font-semibold text-foreground">
                      {groupExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-tertiary" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-tertiary" />
                      )}
                      <span>Менеджеры отдела продаж</span>
                      <span className="text-[11px] text-tertiary font-normal">
                        ({filteredManagers.length})
                      </span>
                    </div>
                  </td>
                </tr>

                {groupExpanded &&
                  (filteredManagers.length > 0 ? (
                    filteredManagers.map((mgr) => (
                    <tr
                      key={mgr.id}
                      className="border-b border-subtle/60 hover:bg-hover/30 transition-colors duration-150"
                    >
                      {/* 1. Manager Name & Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2.5">
                          <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">
                            {mgr.name.slice(0, 1)}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground text-xs">
                              {mgr.name}
                            </div>
                            <div className="text-[10px] text-tertiary">{mgr.role}</div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Inline Sparkline Chart */}
                      <td className="py-3 px-3 text-center align-middle">
                        <InlineSparkline days={mgr.days} metricMode={metricMode} />
                      </td>

                      {/* 3. Aggregated Total Column */}
                      <td className="py-3 px-3 text-center font-mono font-bold text-foreground text-xs align-middle">
                        {metricMode === 'calls' ? (
                          <span>{mgr.totalCalls} зв</span>
                        ) : metricMode === 'score' ? (
                          <span
                            className={
                              mgr.avgScore >= CALL_SCORE_THRESHOLDS.high.min
                                ? 'text-emerald-500'
                                : mgr.avgScore >= CALL_SCORE_THRESHOLDS.mid.min
                                ? 'text-amber-500'
                                : 'text-rose-500'
                            }
                          >
                            {mgr.avgScore}
                          </span>
                        ) : (
                          <span>{mgr.nextStepPct}%</span>
                        )}
                      </td>

                      {/* 4. Day-by-Day Heatmap Tinted Cells */}
                      {mgr.days.map((d, dIdx) => {
                        const isGood =
                          metricMode === 'calls'
                            ? d.callsCount >= 8
                            : metricMode === 'score'
                            ? d.avgScore >= CALL_SCORE_THRESHOLDS.high.min
                            : d.nextStepPct >= 80;

                        const isBad =
                          metricMode === 'calls'
                            ? d.callsCount <= 2
                            : metricMode === 'score'
                            ? d.avgScore < CALL_SCORE_THRESHOLDS.mid.min
                            : d.nextStepPct < 50;

                        // Soft pastel heatmap tinting
                        const tintClass =
                          d.callsCount === 0 || isBad
                            ? 'bg-rose-500/15 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border-rose-500/20'
                            : isGood
                            ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-500/20';

                        return (
                          <td key={dIdx} className="py-2 px-1.5 text-center align-middle">
                            <div
                              className={cn(
                                'rounded-md py-1.5 px-1 font-mono text-xs border transition-all duration-150',
                                tintClass
                              )}
                              title={`${mgr.name} · ${d.dateStr}: ${d.callsCount} звонков, балл ${d.avgScore}/13, Next Step ${d.nextStepPct}%`}
                            >
                              <div className="font-bold leading-tight">
                                {metricMode === 'calls'
                                  ? d.callsCount
                                  : metricMode === 'score'
                                  ? d.avgScore
                                  : `${d.nextStepPct}%`}
                              </div>
                              <div className="text-[9px] opacity-75 font-normal">
                                {metricMode === 'calls'
                                  ? `${d.avgScore} б`
                                  : `${d.callsCount} зв`}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-xs text-secondary">
                      {managerRows.length === 0
                        ? 'За последние 7 дней звонков менеджеров не зафиксировано'
                        : 'Менеджеры по заданному фильтру не найдены'}
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* Heatmap Legend Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-surface/60 border-t border-subtle text-[11px] text-tertiary">
        <div className="flex items-center space-x-3">
          <span className="font-medium text-foreground">Шкала подсветки:</span>
          <div className="flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" />
            <span>Эталон (≥9 б / ≥8 зв)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-sm bg-amber-500" />
            <span>В норме (6-8 б)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="h-2 w-2 rounded-sm bg-rose-500" />
            <span>Слив / Ноль звонков</span>
          </div>
        </div>

        <div className="font-mono text-[10px]">
          Синхронизировано с amoCRM API & RevOps Voice Audit (13 критериев)
        </div>
      </div>
    </div>
  );
}

export default DailyPulseMatrix;

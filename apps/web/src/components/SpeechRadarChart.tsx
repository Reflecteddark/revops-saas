/**
 * apps/web/src/components/SpeechRadarChart.tsx
 *
 * Vector SVG Speech Radar / Spider Chart for RevOps OS.
 * Compares selected sales rep or entire department against
 * the canonical 13-criteria B2B standard benchmark without heavy external libraries.
 * The same counting as the heatmap (lib/callStats.ts): assessed calls only, and a criterion's rate is over the calls
 * where it was really assessed. "Вся команда" is every rated call of the period (the same set as the KPI row, calls
 * without a CRM manager included); one manager is a CRM user. The polygon is drawn at the real value (0% sits in
 * the centre).
 */

import * as React from 'react';
import { Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { criterionRates, hasCrmManager, managerStats, ruPlural, summarizeCalls } from '@/lib/callStats';
import type { Call } from '@/types/api';

import { CR_DEFINITIONS } from '@/lib/criteria';

export interface SpeechRadarChartProps {
  calls?: Call[];
  selectedRep?: string | null;
  onSelectRep?: (repName: string | null) => void;
  hoveredCriterion?: number | null;
  onHoverCriterion?: (crIdx: number | null) => void;
  selectedCriterion?: number | null;
  onSelectCriterion?: (crIdx: number) => void;
  className?: string;
}

export function SpeechRadarChart({
  calls = [],
  selectedRep = null,
  onSelectRep,
  hoveredCriterion = null,
  onHoverCriterion,
  selectedCriterion = null,
  onSelectCriterion,
  className,
}: SpeechRadarChartProps) {
  const reps = React.useMemo(() => managerStats(calls).map((m) => m.name), [calls]);

  const activeRep = selectedRep && reps.includes(selectedRep) ? selectedRep : null;

  // 13 criteria pass rates for the active selection
  const { actualValues, assessedCount } = React.useMemo(() => {
    const scope = activeRep ? calls.filter((c) => hasCrmManager(c) && c.manager.trim() === activeRep) : calls;
    return {
      actualValues: criterionRates(scope).map((r) => (r.rate === null ? 0 : Math.round(r.rate * 100))),
      assessedCount: summarizeCalls(scope).assessed,
    };
  }, [calls, activeRep]);

  // Geometry parameters
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 110;
  const numAxes = 13;

  // Polar coordinate helper
  const getCoords = (index: number, valPercent: number) => {
    const angle = (2 * Math.PI * index) / numAxes - Math.PI / 2;
    const r = (radius * valPercent) / 100;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  // Polygon points strings
  const benchmarkPoints = Array.from({ length: numAxes })
    .map((_, i) => {
      const { x, y } = getCoords(i, 100);
      return `${x},${y}`;
    })
    .join(' ');

  const actualPoints = actualValues
    .map((val, i) => {
      const { x, y } = getCoords(i, val);
      return `${x},${y}`;
    })
    .join(' ');

  const activeCrIndex =
    hoveredCriterion !== null && hoveredCriterion !== undefined
      ? hoveredCriterion - 1
      : selectedCriterion !== null && selectedCriterion !== undefined
        ? selectedCriterion
        : null;
  const activeCrDef =
    activeCrIndex !== null && activeCrIndex >= 0 && activeCrIndex < CR_DEFINITIONS.length
      ? CR_DEFINITIONS[activeCrIndex]
      : null;

  return (
    <div
      className={cn(
        'surface space-y-4 rounded-xl border border-subtle p-5',
        className
      )}
      data-testid="speech-radar-chart"
    >
      {/* Header & Rep Switcher */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-subtle bg-hover text-foreground">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">
              Радар соблюдения стандартов речи
            </h3>
            <p className="text-xs text-secondary">
              Баланс 13 стандартов (CR1–CR13) относительно эталона B2B •{' '}
              {assessedCount > 0
                ? `${assessedCount} ${ruPlural(assessedCount, ['оценённый звонок', 'оценённых звонка', 'оценённых звонков'])}`
                : 'нет оценённых звонков'}
            </p>
          </div>
        </div>

        {/* Rep Selector Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelectRep?.(null)}
            className={cn(
              'h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
              activeRep === null
                ? 'border-strong bg-active text-foreground'
                : 'border-subtle bg-transparent text-secondary hover:bg-hover hover:text-foreground'
            )}
          >
            Вся команда
          </button>
          {reps.map((rep) => (
            <button
              key={rep}
              type="button"
              onClick={() => onSelectRep?.(rep)}
              className={cn(
                'h-7 rounded-md border px-2.5 text-xs font-medium transition-colors',
                activeRep === rep
                  ? 'border-strong bg-active text-foreground'
                  : 'border-subtle bg-transparent text-secondary hover:bg-hover hover:text-foreground'
              )}
            >
              {rep}
            </button>
          ))}
        </div>
      </div>

      {/* Macro/Micro Cross-Highlight Hint Bar */}
      {activeCrDef && activeCrIndex !== null ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => activeCrIndex !== null && onSelectCriterion?.(activeCrIndex)}
          className="flex cursor-pointer items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-foreground transition-all hover:bg-primary/15"
          title="Кликните для фильтрации звонков с провалом по этому критерию"
        >
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-primary">CR{activeCrIndex + 1}</span>
            <span className="font-semibold">{activeCrDef.label}:</span>
            <span className="font-mono font-bold tabular-nums text-primary">{actualValues[activeCrIndex]}%</span>
            <span className="text-secondary">соблюдения</span>
          </div>
          <span className="text-[11px] font-medium text-primary underline underline-offset-2">
            {selectedCriterion === activeCrIndex ? 'Фильтр активен (сбросить)' : 'Фильтровать звонки →'}
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-subtle bg-hover/20 px-3 py-1.5 text-xs text-secondary">
          <span>Наведите на ось радара или колонку карты для синхронной подсветки</span>
          <span className="text-[11px] text-tertiary">13 критериев CR1–CR13</span>
        </div>
      )}

      {/* SVG Canvas */}
      <div className="relative flex items-center justify-center overflow-hidden py-2">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-auto w-full max-w-[360px] select-none drop-shadow-sm"
        >
          {/* Concentric Grid Polygons */}
          {[25, 50, 75, 100].map((level) => {
            const pts = Array.from({ length: numAxes })
              .map((_, i) => {
                const { x, y } = getCoords(i, level);
                return `${x},${y}`;
              })
              .join(' ');
            return (
              <polygon
                key={level}
                points={pts}
                fill="none"
                stroke="currentColor"
                className="text-foreground/10 dark:text-white/[0.05]"
                strokeWidth={1}
              />
            );
          })}

          {/* Radial Spokes */}
          {Array.from({ length: numAxes }).map((_, i) => {
            const outer = getCoords(i, 100);
            const isHovered = hoveredCriterion === i + 1;
            const isSelected = selectedCriterion === i;
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={outer.x}
                y2={outer.y}
                stroke="currentColor"
                className={cn(
                  'transition-colors duration-200',
                  isHovered || isSelected
                    ? 'stroke-primary stroke-[2.5]'
                    : 'text-foreground/10 dark:text-white/[0.06] stroke-[1]'
                )}
              />
            );
          })}

          {/* Benchmark 100% Polygon */}
          <polygon
            points={benchmarkPoints}
            fill="none"
            stroke="rgba(6, 182, 212, 0.4)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />

          {/* Actual Performance Polygon */}
          {assessedCount > 0 && (
            <polygon
              points={actualPoints}
              fill="rgba(139, 92, 246, 0.22)"
              stroke="rgb(139, 92, 246)"
              strokeWidth={2}
            />
          )}

          {/* Actual Data Points */}
          {assessedCount > 0 && actualValues.map((val, i) => {
            const { x, y } = getCoords(i, val);
            const isHovered = hoveredCriterion === i + 1;
            const isSelected = selectedCriterion === i;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={isHovered || isSelected ? 5.5 : 3.5}
                className={cn(
                  'transition-all duration-200 stroke-white/90',
                  isHovered || isSelected ? 'fill-primary' : 'fill-cyan-400'
                )}
                strokeWidth={1.5}
              />
            );
          })}

          {/* Axis Labels */}
          {CR_DEFINITIONS.map((def, i) => {
            const angle = (2 * Math.PI * i) / numAxes - Math.PI / 2;
            const labelRadius = radius + 24;
            const lx = cx + labelRadius * Math.cos(angle);
            const ly = cy + labelRadius * Math.sin(angle);
            const isHovered = hoveredCriterion === i + 1;
            const isSelected = selectedCriterion === i;

            return (
              <g
                key={def.id}
                className="cursor-pointer transition-all"
                onMouseEnter={() => onHoverCriterion?.(i + 1)}
                onMouseLeave={() => onHoverCriterion?.(null)}
                onClick={() => onSelectCriterion?.(i)}
              >
                <title>{`${def.label} (CR${i + 1}): ${actualValues[i]}% соблюдения • Кликните для фильтрации`}</title>
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={cn(
                    'select-none text-[10px] transition-colors',
                    isHovered || isSelected ? 'fill-primary font-bold' : 'fill-zinc-400 font-medium'
                  )}
                >
                  <tspan
                    x={lx}
                    dy="-0.45em"
                    className={cn(
                      'font-mono text-[9px] font-bold',
                      isHovered || isSelected ? 'fill-primary' : 'fill-primary/75'
                    )}
                  >
                    {`CR${i + 1}`}
                  </tspan>
                  <tspan x={lx} dy="1.15em">
                    {def.shortLabel}
                  </tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 border-t border-subtle pt-1 text-xs text-secondary">
        <div className="flex items-center gap-2">
          <span className="w-5 border-b-2 border-dashed border-cyan-400/60" />
          <span>Эталон B2B (100%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500 ring-2 ring-violet-500/20" />
          <span className="font-medium text-foreground">
            {activeRep ? `Факт: ${activeRep}` : 'Факт: Команда'}
          </span>
        </div>
      </div>
    </div>
  );
}

export default SpeechRadarChart;

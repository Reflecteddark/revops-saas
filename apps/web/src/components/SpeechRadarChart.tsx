/**
 * apps/web/src/components/SpeechRadarChart.tsx
 *
 * Vector SVG Speech Radar / Spider Chart for RevOps OS.
 * Compares selected sales rep or entire department against
 * the canonical 13-criteria B2B standard benchmark without heavy external libraries.
 * The same counting as the heatmap (lib/callStats.ts): CRM managers only, assessed calls only, and a criterion's
 * rate is over the calls where it was really assessed. The polygon is drawn at the real value (0% sits in the centre).
 */

import * as React from 'react';
import { Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { criterionRates, hasCrmManager, managerStats, ruPlural, summarizeCalls } from '@/lib/callStats';
import type { Call } from '@/types/api';

export interface SpeechRadarChartProps {
  calls?: Call[];
  selectedRep?: string | null;
  onSelectRep?: (repName: string | null) => void;
  className?: string;
}

import { CR_SHORT_LABELS } from '@/lib/criteria';
const RADAR_LABELS: string[] = CR_SHORT_LABELS;

export function SpeechRadarChart({
  calls = [],
  selectedRep = null,
  onSelectRep,
  className,
}: SpeechRadarChartProps) {
  const reps = React.useMemo(() => managerStats(calls).map((m) => m.name), [calls]);

  const activeRep = selectedRep && reps.includes(selectedRep) ? selectedRep : null;

  // 13 criteria pass rates for the active selection
  const { actualValues, assessedCount } = React.useMemo(() => {
    const team = calls.filter(hasCrmManager);
    const scope = activeRep ? team.filter((c) => c.manager.trim() === activeRep) : team;
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
              Сравнение факта диалогов с эталоном B2B (100%) •{' '}
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
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={outer.x}
                y2={outer.y}
                stroke="currentColor"
                className="text-foreground/10 dark:text-white/[0.06]"
                strokeWidth={1}
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
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={3.5}
                className="fill-cyan-400 stroke-white/80"
                strokeWidth={1.5}
              />
            );
          })}

          {/* Axis Labels */}
          {RADAR_LABELS.map((label, i) => {
            const angle = (2 * Math.PI * i) / numAxes - Math.PI / 2;
            const labelRadius = radius + 22;
            const lx = cx + labelRadius * Math.cos(angle);
            const ly = cy + labelRadius * Math.sin(angle);

            return (
              <text
                key={i}
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-zinc-400 text-[10px] font-medium"
              >
                {label}
              </text>
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

import React, { useMemo, useState } from 'react';
import { Call, ManagerConfig } from '@/types/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flame, Clock, PhoneOutgoing, Calendar, Sparkles } from 'lucide-react';

export interface DailyHourlyHeatmapProps {
  calls: Call[];
  managers?: ManagerConfig[];
  selectedDate?: string;
  className?: string;
}

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

export function extractCallHourAndDate(c: Call): { dateStr: string; hour: number | null } {
  const raw = c.date || c.created_at || '';
  if (!raw) return { dateStr: '', hour: null };

  // Match YYYY-MM-DD HH:mm
  const isoMatch = raw.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{2}):/);
  if (isoMatch) {
    return { dateStr: isoMatch[1], hour: parseInt(isoMatch[2], 10) };
  }

  // Match DD.MM.YYYY HH:mm
  const ruMatch = raw.match(/(\d{2})\.(\d{2})\.(\d{4})[T\s](\d{2}):/);
  if (ruMatch) {
    const dateStr = `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}`;
    return { dateStr, hour: parseInt(ruMatch[4], 10) };
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return { dateStr: parsed.toISOString().slice(0, 10), hour: parsed.getHours() };
  }

  return { dateStr: '', hour: null };
}

export function isCallOverMinute(c: Call): boolean {
  if (typeof c.duration_seconds === 'number') {
    return c.duration_seconds >= 60;
  }
  if (c.duration) {
    const parts = c.duration.split(':').map((p) => parseInt(p.trim(), 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1] >= 60;
    }
  }
  return false;
}

export const DailyHourlyHeatmap: React.FC<DailyHourlyHeatmapProps> = ({
  calls,
  managers = [],
  selectedDate: propDate,
  className = '',
}) => {
  // 1. Determine available dates
  const availableDates = useMemo(() => {
    const dateSet = new Set<string>();
    calls.forEach((c) => {
      const { dateStr } = extractCallHourAndDate(c);
      if (dateStr) dateSet.add(dateStr);
    });
    const sorted = Array.from(dateSet).sort().reverse();
    return sorted.length > 0 ? sorted : [new Date().toISOString().slice(0, 10)];
  }, [calls]);

  const [activeDate, setActiveDate] = useState<string>(
    propDate || availableDates[0] || new Date().toISOString().slice(0, 10)
  );

  // 2. Filter calls for the active date
  const dayCalls = useMemo(() => {
    return calls.filter((c) => {
      const { dateStr } = extractCallHourAndDate(c);
      return dateStr === activeDate;
    });
  }, [calls, activeDate]);

  // 3. Resolve manager list
  const managerList = useMemo(() => {
    if (managers.length > 0) return managers;
    const names = Array.from(new Set(calls.map((c) => c.manager).filter(Boolean)));
    return names.map((name, idx) => ({
      id: `m-${idx + 1}`,
      name,
      role: 'Менеджер ОП',
      capacity: 40,
      daily_calls_target: 20,
      daily_dials_target: 40,
    }));
  }, [managers, calls]);

  // 4. Group data: manager -> hour -> { dials, calls60s }
  const matrix = useMemo(() => {
    const data: Record<string, Record<number, { dials: number; calls60s: number }>> = {};

    managerList.forEach((m) => {
      data[m.name] = {};
      HOURS.forEach((h) => {
        data[m.name][h] = { dials: 0, calls60s: 0 };
      });
    });

    dayCalls.forEach((c) => {
      const { hour } = extractCallHourAndDate(c);
      if (hour !== null && HOURS.includes(hour)) {
        const mgrName = c.manager || 'Не указан';
        if (!data[mgrName]) {
          data[mgrName] = {};
          HOURS.forEach((h) => {
            data[mgrName][h] = { dials: 0, calls60s: 0 };
          });
        }
        data[mgrName][hour].dials += 1;
        if (isCallOverMinute(c)) {
          data[mgrName][hour].calls60s += 1;
        }
      }
    });

    return data;
  }, [dayCalls, managerList]);

  // 5. Calculate hourly team totals
  const hourlyTotals = useMemo(() => {
    const totals: Record<number, { dials: number; calls60s: number }> = {};
    HOURS.forEach((h) => {
      totals[h] = { dials: 0, calls60s: 0 };
    });

    Object.values(matrix).forEach((mgrHours) => {
      HOURS.forEach((h) => {
        totals[h].dials += mgrHours[h]?.dials || 0;
        totals[h].calls60s += mgrHours[h]?.calls60s || 0;
      });
    });

    return totals;
  }, [matrix]);

  // 6. Find prime hour (peak dials) and activity gaps
  const primeHour = useMemo(() => {
    let peakHour = 11;
    let maxDials = -1;
    HOURS.forEach((h) => {
      if (hourlyTotals[h].dials > maxDials) {
        maxDials = hourlyTotals[h].dials;
        peakHour = h;
      }
    });
    return maxDials > 0 ? peakHour : null;
  }, [hourlyTotals]);

  // Total daily sums across team
  const teamDailyTotal = useMemo(() => {
    let dials = 0;
    let calls60s = 0;
    Object.values(hourlyTotals).forEach((h) => {
      dials += h.dials;
      calls60s += h.calls60s;
    });
    return { dials, calls60s };
  }, [hourlyTotals]);

  // Intensity color generator
  const getCellIntensityClass = (dials: number, calls60s: number) => {
    if (dials === 0) {
      return 'bg-subtle/20 text-muted-foreground/30 border-subtle/30';
    }
    if (dials >= 8 || calls60s >= 3) {
      return 'bg-emerald-500/25 text-emerald-300 font-bold border-emerald-500/40 shadow-sm shadow-emerald-500/10';
    }
    if (dials >= 4 || calls60s >= 1) {
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-medium';
    }
    return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
  };

  return (
    <Card className={`overflow-hidden border border-subtle bg-surface ${className}`} data-testid="daily-hourly-heatmap">
      <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between border-b border-subtle">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-amber-400 animate-pulse" />
            <CardTitle className="text-sm font-bold text-foreground">
              Температурная карта звонков отдела (8:00 – 20:00)
            </CardTitle>
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 font-mono text-[11px]">
              наборы / от 1 мин
            </Badge>
          </div>
          <CardDescription className="text-xs text-muted-foreground">
            Почасовая интенсивность вызовов менеджеров: наборы звонков всего через слэш целевые разговоры от 60 секунд.
          </CardDescription>
        </div>

        {/* Date Selector & Peak Badge */}
        <div className="flex flex-wrap items-center gap-2">
          {primeHour !== null && (
            <Badge variant="outline" className="gap-1 border-primary/40 bg-primary/10 text-primary font-mono text-[11px]">
              <Sparkles className="h-3 w-3" />
              <span>Prime Time: {primeHour}:00 ({hourlyTotals[primeHour].dials} наб.)</span>
            </Badge>
          )}

          <div className="flex items-center gap-1.5 rounded-lg border border-subtle bg-subtle/30 px-2 py-1 text-xs">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={activeDate}
              onChange={(e) => setActiveDate(e.target.value)}
              className="bg-transparent font-mono text-xs font-semibold text-foreground outline-none cursor-pointer"
              data-testid="heatmap-date-selector"
            >
              {availableDates.map((d) => (
                <option key={d} value={d} className="bg-surface text-foreground">
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {/* Heatmap Matrix Table */}
        <div className="overflow-x-auto rounded-lg border border-subtle">
          <table className="w-full text-xs">
            <thead className="bg-subtle/60 border-b border-subtle text-muted-foreground font-mono">
              <tr>
                <th className="min-w-[170px] px-3 py-2.5 text-left font-semibold">
                  Менеджер
                </th>
                {HOURS.map((h) => (
                  <th
                    key={h}
                    className={`min-w-[58px] px-1.5 py-2 text-center font-medium ${
                      h === primeHour ? 'text-primary font-bold bg-primary/5' : ''
                    }`}
                  >
                    <div className="text-[11px]">{h.toString().padStart(2, '0')}:00</div>
                  </th>
                ))}
                <th className="min-w-[100px] px-3 py-2 text-center font-semibold bg-subtle/80 text-foreground">
                  Итого день
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle font-mono">
              {Object.keys(matrix).map((mgrName) => {
                const mgrData = matrix[mgrName];
                const mgrConfig = managerList.find((m) => m.name === mgrName);
                const dialsTarget = mgrConfig?.daily_dials_target ?? 40;
                const callsTarget = mgrConfig?.daily_calls_target ?? 20;

                // Day totals for this manager
                let mgrTotalDials = 0;
                let mgrTotal60s = 0;
                HOURS.forEach((h) => {
                  mgrTotalDials += mgrData[h]?.dials || 0;
                  mgrTotal60s += mgrData[h]?.calls60s || 0;
                });

                const isTargetAchieved = mgrTotal60s >= callsTarget && mgrTotalDials >= dialsTarget;

                return (
                  <tr
                    key={mgrName}
                    className="hover:bg-hover/40 transition-colors"
                    data-testid={`heatmap-row-${mgrName}`}
                  >
                    {/* Manager Name + Target hint */}
                    <td className="px-3 py-2 font-sans font-medium text-foreground">
                      <div className="leading-tight">
                        <div className="font-semibold text-xs">{mgrName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          план: {callsTarget} целевых / {dialsTarget} наборов
                        </div>
                      </div>
                    </td>

                    {/* Hourly Cells */}
                    {HOURS.map((h) => {
                      const cell = mgrData[h] || { dials: 0, calls60s: 0 };
                      const intensityClass = getCellIntensityClass(cell.dials, cell.calls60s);
                      const isWorkingHour = h >= 10 && h <= 18;
                      const isActivityGap = isWorkingHour && cell.dials === 0;

                      return (
                        <td
                          key={h}
                          className={`p-1 text-center align-middle ${
                            h === primeHour ? 'bg-primary/5' : ''
                          }`}
                        >
                          <div
                            className={`rounded-md border py-1 px-1 transition-all text-[11px] ${intensityClass} ${
                              isActivityGap ? 'hover:border-amber-400/50' : ''
                            }`}
                            title={`${mgrName} в ${h}:00: ${cell.dials} наборов всего, ${cell.calls60s} разговоров от 60 сек`}
                            data-testid={`cell-${mgrName}-${h}`}
                          >
                            {cell.dials > 0 ? (
                              <span>
                                {cell.dials} <span className="text-[10px] opacity-60">/</span> {cell.calls60s}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30">—</span>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Manager Day Total */}
                    <td className="px-3 py-2 text-center bg-subtle/40 font-bold">
                      <div className="leading-tight">
                        <span
                          className={
                            isTargetAchieved
                              ? 'text-emerald-400'
                              : mgrTotal60s > 0
                              ? 'text-foreground'
                              : 'text-muted-foreground'
                          }
                        >
                          {mgrTotalDials} / {mgrTotal60s}
                        </span>
                        <div className="text-[10px] font-normal text-muted-foreground">
                          {callsTarget > 0 ? `${Math.round((mgrTotal60s / callsTarget) * 100)}% нормы` : '—'}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Team Hourly Summary Row */}
              <tr className="bg-subtle/80 font-bold border-t-2 border-subtle" data-testid="heatmap-team-totals-row">
                <td className="px-3 py-2.5 font-sans text-xs text-foreground">
                  <div className="flex items-center gap-1.5">
                    <PhoneOutgoing className="h-3.5 w-3.5 text-primary" />
                    <span>Всего отдел:</span>
                  </div>
                </td>

                {HOURS.map((h) => {
                  const t = hourlyTotals[h];
                  const intensityClass = getCellIntensityClass(t.dials, t.calls60s);

                  return (
                    <td key={h} className="p-1 text-center">
                      <div
                        className={`rounded-md border py-1 px-1 text-[11px] ${intensityClass}`}
                        title={`Весь отдел в ${h}:00: ${t.dials} наборов / ${t.calls60s} разговоров от 60с`}
                      >
                        {t.dials > 0 ? (
                          <span>
                            {t.dials} <span className="text-[10px] opacity-60">/</span> {t.calls60s}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </div>
                    </td>
                  );
                })}

                {/* Team Grand Total */}
                <td className="px-3 py-2 text-center bg-subtle text-foreground text-xs font-extrabold font-mono">
                  <div className="leading-tight">
                    <span className="text-emerald-400">
                      {teamDailyTotal.dials} / {teamDailyTotal.calls60s}
                    </span>
                    <div className="text-[10px] font-normal text-muted-foreground font-sans">
                      всего за день
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Legend Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-foreground">Интенсивность:</span>
            <div className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-subtle/40 border border-subtle" />
              <span className="text-[11px]">0</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-500/20 border border-sky-500/40" />
              <span className="text-[11px]">1–3 наб.</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/40" />
              <span className="text-[11px]">4–7 наб.</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/40 border border-emerald-400 font-bold" />
              <span className="text-[11px]">8+ наб. (Prime)</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>Формат ячейки: <strong>{'{наборы всего} / {звонки ≥60 сек}'}</strong></span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

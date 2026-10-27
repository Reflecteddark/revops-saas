/**
 * apps/web/src/components/rnp/RnpStandupView.tsx
 *
 * 5-Minute Morning Standup Mode for Sales Directors (РОП / CEO).
 * Benchmarked against Pulsar7 & Salesforce Pipeline Inspection:
 * - 5-minute countdown standup timer (Start / Pause / Reset)
 * - Yesterday's factual actions recap (target calls >90s, zoom meetings, won deals, leaks)
 * - Manager Focus Cards with traffic-light status (🟢 / 🟡 / 🔴) and concrete actions
 * - High-risk deals exceeding stage SLA (>48h) needing immediate intervention
 */

import * as React from 'react';
import {
  Clock,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  PhoneCall,
  Calendar,
  Sparkles,
  ShieldAlert,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { Call, Deal, ManagerConfig } from '@/types/api';

export interface RnpStandupViewProps {
  calls: Call[];
  deals: Deal[];
  managers: ManagerConfig[];
  planTarget: number;
  onInspectCall?: (call: Call) => void;
}

export function RnpStandupView({
  calls,
  deals,
  managers,
  planTarget,
  onInspectCall,
}: RnpStandupViewProps) {
  // 5-Minute Standup Timer state (300 seconds)
  const [secondsLeft, setSecondsLeft] = React.useState<number>(300);
  const [isTimerRunning, setIsTimerRunning] = React.useState<boolean>(false);

  React.useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    } else if (secondsLeft === 0) {
      setIsTimerRunning(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, secondsLeft]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Filter yesterday's calls
  const yesterdayCalls = React.useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);

    const filtered = calls.filter((c) => {
      const dt = c.date || c.created_at || '';
      return dt.includes(yStr);
    });

    // Fallback: if today is Monday or yesterday had 0 calls, take the most recent 10 calls
    return filtered.length > 0 ? filtered : calls.slice(0, 10);
  }, [calls]);

  // Yesterday's metrics
  const targetCallsCount = yesterdayCalls.filter((c) => {
    const durSec = c.duration_seconds || 0;
    return durSec >= 90 || c.score !== null;
  }).length;

  const zoomScheduledCount = yesterdayCalls.filter(
    (c) => c.zoom_scheduled || (c.cr && c.cr[6] === 1)
  ).length;

  const yesterdayLeaksCount = yesterdayCalls.filter(
    (c) => c.status === 'risk' || (c.score !== null && c.score < 6)
  ).length;

  const wonDealsCount = deals.filter((d) => d.status === 'won').length;

  // Stalled high-value deals (>48h SLA risk)
  const highRiskDeals = React.useMemo(() => {
    return deals
      .filter((d) => d.sla_risk || d.status === 'risk')
      .slice(0, 5);
  }, [deals]);

  // Manager performance synthesis for Standup
  const managerAnalysis = React.useMemo(() => {
    const mgrList = managers.length > 0
      ? managers
      : Array.from(new Set(calls.map((c) => c.manager).filter(Boolean))).map((name, i) => ({
          id: `m-${i + 1}`,
          name,
          role: 'Менеджер ОП',
          capacity: 40,
        }));

    return mgrList.map((m) => {
      const mgrCalls = calls.filter((c) => c.manager === m.name);
      const mgrDeals = deals.filter((d) => d.responsible_user === m.name);
      const mgrWonDeals = mgrDeals.filter((d) => d.status === 'won');
      const mgrRevenue = mgrWonDeals.reduce((sum, d) => sum + (d.amount || 0), 0);

      const totalCalls = mgrCalls.length;
      const scores = mgrCalls.map((c) => c.score).filter((s): s is number => s !== null);
      const avgScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
      const zoomCount = mgrCalls.filter((c) => c.zoom_scheduled || (c.cr && c.cr[6] === 1)).length;
      const riskDealsCount = mgrDeals.filter((d) => d.sla_risk).length;

      // Traffic-light status calculation:
      // Red: 0 won deals or risk deals > 3 or avgScore < 6
      // Yellow: avgScore < 8 or capacity exceeded
      // Green: avgScore >= 8 and active won deals
      let status: 'green' | 'yellow' | 'red' = 'green';
      let actionRecommendation = 'В нормативном графике. Удерживать конверсию и передавать целевые лиды.';

      if (riskDealsCount > 2 || (totalCalls > 0 && avgScore < 6)) {
        status = 'red';
        actionRecommendation = `Требуется немедленный разбор: ${riskDealsCount} сделок с просроченным SLA и низкий балл диалога (${avgScore}/13).`;
      } else if (mgrDeals.length > m.capacity) {
        status = 'yellow';
        actionRecommendation = `Перегруз воронки: ${mgrDeals.length} сделок при вместимости ${m.capacity}. Перераспределить зависшие сделки.`;
      } else if (zoomCount === 0 && totalCalls > 5) {
        status = 'yellow';
        actionRecommendation = 'Низкая конверсия в следующий шаг: 0 назначенных встреч. Проверить фиксацию договоренностей.';
      }

      return {
        ...m,
        totalCalls,
        avgScore,
        zoomCount,
        dealsCount: mgrDeals.length,
        riskDealsCount,
        revenue: mgrRevenue,
        status,
        actionRecommendation,
      };
    });
  }, [managers, calls, deals]);

  return (
    <div className="space-y-6" data-testid="rnp-standup-view">
      {/* 1. Header with 5-Minute Timer & Executive Standup Mission */}
      <div className="surface rounded-2xl border border-subtle p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
                <Flame className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold text-foreground">
                Утренняя планёрка РОПа (5-минутный спринт)
              </h2>
              <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 font-mono">
                STANDUP MODE
              </Badge>
            </div>
            <p className="text-xs text-secondary max-w-2xl text-pretty">
              Регламент фокусного утреннего разбора: факт вчерашних действий, точки провисания SLA по менеджерам и 3 ключевые сделки для закрытия сегодня (план {planTarget.toLocaleString('ru-RU')} ₽).
            </p>
          </div>

          {/* Interactive Countdown Timer */}
          <div className="flex items-center gap-3 bg-subtle/50 px-4 py-2.5 rounded-xl border border-subtle shrink-0">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-tertiary" />
              <span
                className={`font-mono text-xl font-bold tabular-nums ${
                  secondsLeft <= 60 ? 'text-rose-500 animate-pulse' : 'text-foreground'
                }`}
                data-testid="standup-timer-display"
              >
                {formatTimer(secondsLeft)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={isTimerRunning ? 'outline' : 'default'}
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                className="h-7 px-2.5 text-xs gap-1 font-medium"
                data-testid="btn-standup-timer-toggle"
              >
                {isTimerRunning ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                <span>{isTimerRunning ? 'Пауза' : 'Старт'}</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsTimerRunning(false);
                  setSecondsLeft(300);
                }}
                className="h-7 w-7 p-0 text-tertiary hover:text-foreground"
                title="Сбросить таймер на 5:00"
                data-testid="btn-standup-timer-reset"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Yesterday's Core Actions Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-subtle">
          <div className="p-3 rounded-xl bg-subtle/30 border border-subtle">
            <div className="flex items-center gap-1.5 text-xs text-tertiary">
              <PhoneCall className="h-3.5 w-3.5 text-sky-400" />
              <span>Целевые звонки (&gt;90с)</span>
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-foreground">
              {targetCallsCount} <span className="text-xs text-tertiary font-normal">звонков</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-subtle/30 border border-subtle">
            <div className="flex items-center gap-1.5 text-xs text-tertiary">
              <Calendar className="h-3.5 w-3.5 text-emerald-400" />
              <span>Назначено Zoom/встреч</span>
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-emerald-400">
              {zoomScheduledCount} <span className="text-xs text-tertiary font-normal">встреч</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-subtle/30 border border-subtle">
            <div className="flex items-center gap-1.5 text-xs text-tertiary">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <span>Закрыто сделок (Факт)</span>
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-foreground">
              {wonDealsCount} <span className="text-xs text-tertiary font-normal">оплачено</span>
            </div>
          </div>

          <div
            className={`p-3 rounded-xl bg-subtle/30 border border-subtle ${
              yesterdayLeaksCount > 0 && onInspectCall ? 'cursor-pointer hover:bg-rose-500/10' : ''
            }`}
            onClick={() => {
              if (onInspectCall) {
                const leakCall = yesterdayCalls.find((c) => c.status === 'risk' || (c.score !== null && c.score < 6));
                if (leakCall) onInspectCall(leakCall);
              }
            }}
          >
            <div className="flex items-center gap-1.5 text-xs text-tertiary">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
              <span>Срывы / Токсичные звонки</span>
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-rose-400">
              {yesterdayLeaksCount} <span className="text-xs text-tertiary font-normal">инцидентов</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Manager Focus Cards (Traffic Light Standup Grid) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-foreground">
              Индивидуальная повестка по менеджерам
            </h3>
          </div>
          <span className="text-xs text-tertiary">
            Светофор: 🟢 В норме &bull; 🟡 Внимание &bull; 🔴 Требует вмешательства РОПа
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="standup-managers-grid">
          {managerAnalysis.map((mgr) => (
            <Card
              key={mgr.id}
              className={`border transition-all duration-150 ${
                mgr.status === 'red'
                  ? 'border-rose-500/40 bg-rose-500/5'
                  : mgr.status === 'yellow'
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-subtle bg-surface'
              }`}
              data-testid={`manager-card-${mgr.id}`}
            >
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        mgr.status === 'red'
                          ? 'bg-rose-500 animate-pulse'
                          : mgr.status === 'yellow'
                          ? 'bg-amber-400'
                          : 'bg-emerald-500'
                      }`}
                    />
                    <span>{mgr.name}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-tertiary">
                    {mgr.role} &bull; Вместимость: {mgr.dealsCount}/{mgr.capacity}
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-mono ${
                    mgr.status === 'red'
                      ? 'border-rose-500 text-rose-400'
                      : mgr.status === 'yellow'
                      ? 'border-amber-500 text-amber-400'
                      : 'border-emerald-500 text-emerald-400'
                  }`}
                >
                  {mgr.status === 'red' ? 'ОТСТАВАНИЕ' : mgr.status === 'yellow' ? 'ВНИМАНИЕ' : 'В НОРМЕ'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                {/* Metric metrics chips */}
                <div className="grid grid-cols-3 gap-2 py-1 bg-subtle/30 rounded-lg p-2 text-center">
                  <div>
                    <span className="text-[10px] text-tertiary block">Звонки</span>
                    <span className="font-mono font-semibold text-foreground">{mgr.totalCalls}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-tertiary block">Балл ИИ</span>
                    <span className="font-mono font-semibold text-foreground">
                      {mgr.avgScore > 0 ? `${mgr.avgScore}/13` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-tertiary block">Zoom</span>
                    <span className="font-mono font-semibold text-emerald-400">{mgr.zoomCount}</span>
                  </div>
                </div>

                {/* РОП Action Directive */}
                <div className="p-2.5 rounded-lg bg-subtle/50 border border-subtle">
                  <span className="text-[10px] uppercase font-semibold text-tertiary block mb-0.5">
                    Фокус дня для РОПа:
                  </span>
                  <p className="text-xs text-foreground font-medium leading-relaxed">
                    {mgr.actionRecommendation}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* 3. Top High-Risk Deals Requiring Immediate Action Today */}
      {highRiskDeals.length > 0 && (
        <div className="surface rounded-2xl border border-rose-500/20 p-5 space-y-3 bg-rose-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <h3 className="text-sm font-semibold text-foreground">
                Ключевые сделки с риском срыва регламента (&gt;48ч без движения)
              </h3>
            </div>
            <span className="text-xs text-rose-400 font-mono">
              {highRiskDeals.length} в зоне риска
            </span>
          </div>

          <div className="divide-y divide-subtle/50 overflow-hidden rounded-xl border border-subtle bg-surface">
            {highRiskDeals.map((d) => (
              <div
                key={d.id || d.deal_id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 hover:bg-hover/50 gap-2 transition-colors"
                data-testid={`risk-deal-${d.id || d.deal_id}`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {d.title || d.company_name || `Сделка #${d.crm_deal_id || d.id}`}
                    </span>
                    <Badge variant="outline" className="text-[10px] border-rose-500/30 text-rose-400 font-mono">
                      {d.stage || 'Согласование КП'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-tertiary">
                    Ответственный: <span className="text-secondary font-medium">{d.responsible_user || '—'}</span> &bull;
                    Источник: {d.crm_source || 'CRM'}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <span className="font-mono text-xs font-bold text-foreground">
                    {d.amount ? `${d.amount.toLocaleString('ru-RU')} ₽` : '—'}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-rose-400 font-medium">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Срыв SLA</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

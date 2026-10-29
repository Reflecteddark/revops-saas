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
import { CALL_SCORE_THRESHOLDS } from '@/lib/thresholds';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { DailyHourlyHeatmap } from './DailyHourlyHeatmap';
import type { Call, Deal, ManagerConfig } from '@/types/api';
import { isDealClosed } from '@/lib/dealHealth';

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
  const { yesterdayCalls, isFallback } = React.useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);

    const filtered = calls.filter((c) => {
      const dt = c.date || c.created_at || '';
      return dt.includes(yStr);
    });

    // Fallback: if today is Monday or yesterday had 0 calls, take the most recent 10 calls
    const fallbackNeeded = filtered.length === 0;
    return {
      yesterdayCalls: fallbackNeeded ? calls.slice(0, 10) : filtered,
      isFallback: fallbackNeeded && calls.length > 0,
    };
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
    (c) => c.status === 'risk' || (c.score !== null && c.score < CALL_SCORE_THRESHOLDS.mid.min)
  ).length;

  const wonDealsCount = deals.filter((d) => d.status === 'won').length;

  // Stalled high-value deals (>48h SLA risk)
  const highRiskDeals = React.useMemo(() => {
    return deals
      .filter((d) => !isDealClosed(d) && (d.sla_risk || d.status === 'risk'))
      .slice(0, 5);
  }, [deals]);

  // Manager performance synthesis for Standup
  const managerAnalysis = React.useMemo(() => {
    const mgrList: ManagerConfig[] =
      managers.length > 0
        ? managers
        : Array.from(new Set(calls.map((c) => c.manager).filter(Boolean))).map(
            (name, i) => ({
              id: `m-${i + 1}`,
              name,
              role: 'Менеджер ОП',
              capacity: 40,
              revenue_target: null,
              daily_calls_target: 20,
              monthly_meetings_target: 15,
              next_step_target_pct: 80,
            })
          );

    return mgrList.map((m) => {
      const mgrCalls = calls.filter((c) => c.manager === m.name);
      const mgrDeals = deals.filter((d) => d.responsible_user === m.name);
      const mgrWonDeals = mgrDeals.filter((d) => d.status === 'won');
      const mgrRevenue = mgrWonDeals.reduce(
        (sum, d) => sum + (d.amount || 0),
        0
      );

      const totalCalls = mgrCalls.length;
      const scores = mgrCalls
        .map((c) => c.score)
        .filter((s): s is number => s !== null);
      const avgScore =
        scores.length > 0
          ? Math.round(
              (scores.reduce((a, b) => a + b, 0) / scores.length) * 10
            ) / 10
          : 0;

      // Filter yesterday's calls for this manager
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      const mgrYesterdayCalls = mgrCalls.filter((c) => {
        const dt = c.date || c.created_at || '';
        return dt.includes(yStr);
      });
      const yesterdayCallsCount = mgrYesterdayCalls.length;

      // Next Step strictly from Gemini AI Speech Audit
      const auditedCalls = mgrCalls.filter(
        (c) =>
          c.score !== null || c.next_step !== null || Boolean(c.zoom_scheduled)
      );
      const nextStepCalls = auditedCalls.filter(
        (c) =>
          c.next_step === 1 ||
          Boolean(c.zoom_scheduled) ||
          (c.cr && (c.cr[6] === 1 || c.cr[13] === 1))
      );
      const nextStepPct =
        auditedCalls.length > 0
          ? Math.round((nextStepCalls.length / auditedCalls.length) * 100)
          : null;

      const zoomCount = mgrCalls.filter(
        (c) => Boolean(c.zoom_scheduled) || (c.cr && c.cr[6] === 1)
      ).length;

      const activeDeals = mgrDeals.filter(
        (d) => d.status !== 'won' && d.status !== 'lost'
      );
      const riskDeals = mgrDeals.filter(
        (d) => !isDealClosed(d) && (d.sla_risk || d.status === 'risk')
      );
      const riskDealsCount = riskDeals.length;
      const riskDealsSum = riskDeals.reduce(
        (sum, d) => sum + (d.amount || 0),
        0
      );

      // KPI Norms & Targets
      const revTarget = m.revenue_target;
      const revCompPct =
        revTarget && revTarget > 0
          ? Math.round((mgrRevenue / revTarget) * 100)
          : null;

      const dailyCallsTarget = m.daily_calls_target ?? 20;
      const callsCompPct =
        dailyCallsTarget > 0
          ? Math.round((yesterdayCallsCount / dailyCallsTarget) * 100)
          : 100;

      const meetingsTarget = m.monthly_meetings_target ?? 15;
      const capacityTarget = m.capacity ?? 40;
      const nextStepTarget = m.next_step_target_pct ?? 80;

      // =====================================================================
      // Single Primary Risk Hierarchy (Priority: Next Step -> Calls -> Meetings -> Capacity -> Revenue)
      // Only ONE primary risk is presented to prevent alert fatigue!
      // =====================================================================
      let primaryRiskCategory:
        'next_step' | 'calls' | 'meetings' | 'capacity' | 'revenue' | 'none' =
        'none';
      let primaryRiskTitle = 'В нормативе';
      let primaryRiskMetric = 'Все ключевые нормативы выполняются';
      let actionRecommendation =
        'В нормативном графике. Удерживать конверсию и передавать целевые лиды.';
      let status: 'green' | 'yellow' | 'red' = 'green';

      // 1. Next Step below target (quality and future revenue)
      if (
        auditedCalls.length > 0 &&
        nextStepPct !== null &&
        nextStepPct < nextStepTarget
      ) {
        primaryRiskCategory = 'next_step';
        primaryRiskTitle = 'Качество фиксации договорённостей (Next Step)';
        const missingNextStep = auditedCalls.length - nextStepCalls.length;
        const isRed = nextStepPct < 70;
        status = isRed ? 'red' : 'yellow';
        primaryRiskMetric = `Next Step: ${nextStepPct}% при нормативе ${nextStepTarget}% ${isRed ? '🔴' : '🟡'} (${auditedCalls.length} оценённых звонков, ${missingNextStep} без шага)`;
        actionRecommendation = `До 12:00 закрыть Next Step по ${Math.max(1, riskDealsCount)} открытым сделкам${
          riskDealsSum > 0
            ? ` (под риском ${riskDealsSum.toLocaleString('ru-RU')} ₽)`
            : ''
        }; РОПу прослушать ${Math.min(3, Math.max(1, missingNextStep))} диалога без договоренности.`;
      }
      // 2. Activity / Calls below daily target
      else if (dailyCallsTarget > 0 && callsCompPct < 100) {
        primaryRiskCategory = 'calls';
        primaryRiskTitle = 'Отставание по активности звонков';
        const isRed = callsCompPct < 75;
        status = isRed ? 'red' : 'yellow';
        primaryRiskMetric = `Звонки: ${yesterdayCallsCount} из ${dailyCallsTarget} в день ${isRed ? '🔴' : '🟡'} (выполнение ${callsCompPct}%)`;
        actionRecommendation = `Вывести менеджера на линию в первый час: закрыть дневную норму ${dailyCallsTarget} целевых звонков до 16:00.`;
      }
      // 3. Meetings / Zoom conversion (only evaluated if meetings_enabled !== false)
      else if (
        m.meetings_enabled !== false &&
        meetingsTarget > 0 &&
        zoomCount < Math.round(meetingsTarget * 0.7)
      ) {
        primaryRiskCategory = 'meetings';
        primaryRiskTitle = 'Недобор назначенных встреч (КЭВ)';
        const isRed = zoomCount < Math.round(meetingsTarget * 0.4);
        status = isRed ? 'red' : 'yellow';
        primaryRiskMetric = `Встречи: ${zoomCount} из ${meetingsTarget} в месяц ${isRed ? '🔴' : '🟡'}`;
        actionRecommendation =
          'Усилить квалификационный скрипт на выявление болей и назначить 2 встречи до конца недели.';
      }
      // 4. Funnel Capacity overload
      else if (activeDeals.length > capacityTarget) {
        primaryRiskCategory = 'capacity';
        primaryRiskTitle = 'Перегруз воронки менеджера';
        status = 'yellow';
        primaryRiskMetric = `Загрузка: ${activeDeals.length} сделок при ёмкости ${capacityTarget} сделок 🟡`;
        actionRecommendation = `Перераспределить ${activeDeals.length - capacityTarget} зависших сделок без активности на свободных сотрудников.`;
      }
      // 5. Revenue Target behind pace (only if target is configured, null is NOT penalized)
      else if (
        typeof revTarget === 'number' &&
        revTarget > 0 &&
        revCompPct !== null &&
        revCompPct < 70
      ) {
        primaryRiskCategory = 'revenue';
        primaryRiskTitle = 'Отставание по выручке от темпа плана';
        status = 'red';
        primaryRiskMetric = `Выручка: ${mgrRevenue.toLocaleString('ru-RU')} ₽ из плана ${revTarget.toLocaleString('ru-RU')} ₽ (${revCompPct}%) 🔴`;
        actionRecommendation =
          'Сфокусироваться на дожиме 2 ключевых сделок на этапах согласования договора и выставления счета.';
      }

      return {
        ...m,
        totalCalls,
        yesterdayCallsCount,
        avgScore,
        zoomCount,
        dealsCount: mgrDeals.length,
        activeDealsCount: activeDeals.length,
        riskDealsCount,
        riskDealsSum,
        revenue: mgrRevenue,
        revTarget,
        revCompPct,
        dailyCallsTarget,
        callsCompPct,
        meetingsTarget,
        nextStepPct,
        nextStepTarget,
        auditedCallsCount: auditedCalls.length,
        primaryRiskCategory,
        primaryRiskTitle,
        primaryRiskMetric,
        status,
        actionRecommendation,
      };
    });
  }, [managers, calls, deals]);

  return (
    <div className="space-y-6" data-testid="rnp-standup-view">
      {/* 1. Header with 5-Minute Timer & Executive Standup Mission */}
      <div className="surface rounded-2xl border border-subtle p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
                <Flame className="h-4 w-4" />
              </span>
              <h2 className="text-base font-bold text-foreground">
                Утренняя планёрка РОПа (5-минутный спринт)
              </h2>
              <Badge
                variant="outline"
                className="border-amber-500/30 font-mono text-[10px] text-amber-400"
              >
                STANDUP MODE
              </Badge>
              {isFallback && (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-400"
                >
                  Вчера звонков не было — показаны последние
                </Badge>
              )}
            </div>
            <p className="max-w-2xl text-pretty text-xs text-secondary">
              Регламент фокусного утреннего разбора: факт вчерашних действий,
              точки провисания SLA по менеджерам и 3 ключевые сделки для
              закрытия сегодня (план {planTarget.toLocaleString('ru-RU')} ₽).
            </p>
          </div>

          {/* Interactive Countdown Timer */}
          <div className="bg-subtle/50 flex shrink-0 items-center gap-3 rounded-xl border border-subtle px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-tertiary" />
              <span
                className={`font-mono text-xl font-bold tabular-nums ${
                  secondsLeft <= 60
                    ? 'animate-pulse text-rose-500'
                    : 'text-foreground'
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
                className="h-7 gap-1 px-2.5 text-xs font-medium"
                data-testid="btn-standup-timer-toggle"
              >
                {isTimerRunning ? (
                  <Pause className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
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
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-subtle pt-4 sm:grid-cols-4">
          <div className="bg-subtle/30 rounded-xl border border-subtle p-3">
            <div className="flex items-center gap-1.5 text-xs text-tertiary">
              <PhoneCall className="h-3.5 w-3.5 text-sky-400" />
              <span>Целевые звонки (&gt;90с)</span>
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-foreground">
              {targetCallsCount}{' '}
              <span className="text-xs font-normal text-tertiary">звонков</span>
            </div>
          </div>

          <div className="bg-subtle/30 rounded-xl border border-subtle p-3">
            <div className="flex items-center gap-1.5 text-xs text-tertiary">
              <Calendar className="h-3.5 w-3.5 text-emerald-400" />
              <span>Назначено Zoom/встреч</span>
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-emerald-400">
              {zoomScheduledCount}{' '}
              <span className="text-xs font-normal text-tertiary">встреч</span>
            </div>
          </div>

          <div className="bg-subtle/30 rounded-xl border border-subtle p-3">
            <div className="flex items-center gap-1.5 text-xs text-tertiary">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              <span>Закрыто сделок (Факт)</span>
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-foreground">
              {wonDealsCount}{' '}
              <span className="text-xs font-normal text-tertiary">
                оплачено
              </span>
            </div>
          </div>

          <div
            className={`bg-subtle/30 rounded-xl border border-subtle p-3 ${
              yesterdayLeaksCount > 0 && onInspectCall
                ? 'cursor-pointer hover:bg-rose-500/10'
                : ''
            }`}
            onClick={() => {
              if (onInspectCall) {
                const leakCall = yesterdayCalls.find(
                  (c) =>
                    c.status === 'risk' || (c.score !== null && c.score < CALL_SCORE_THRESHOLDS.mid.min)
                );
                if (leakCall) onInspectCall(leakCall);
              }
            }}
          >
            <div className="flex items-center gap-1.5 text-xs text-tertiary">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
              <span>Срывы / Токсичные звонки</span>
            </div>
            <div className="mt-1 font-mono text-lg font-bold text-rose-400">
              {yesterdayLeaksCount}{' '}
              <span className="text-xs font-normal text-tertiary">
                инцидентов
              </span>
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
            Светофор: 🟢 В норме &bull; 🟡 Внимание &bull; 🔴 Требует
            вмешательства РОПа
          </span>
        </div>

        {managerAnalysis.length === 0 ? (
          <div
            className="surface space-y-1.5 rounded-2xl border border-subtle p-6 text-center text-xs text-muted-foreground"
            data-testid="standup-empty-managers"
          >
            <p className="text-sm font-semibold text-foreground">
              Команда отдела продаж ещё не добавлена
            </p>
            <p>
              Чтобы запустить фокусную планёрку и светофор рисков, добавьте
              менеджеров и их нормативы в{' '}
              <strong className="font-medium text-primary">
                «Настройки → Менеджеры»
              </strong>
              .
            </p>
          </div>
        ) : (
          <div
            className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
            data-testid="standup-managers-grid"
          >
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
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          mgr.status === 'red'
                            ? 'animate-pulse bg-rose-500'
                            : mgr.status === 'yellow'
                              ? 'bg-amber-400'
                              : 'bg-emerald-500'
                        }`}
                      />
                      <span>{mgr.name}</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-tertiary">
                      {mgr.role} &bull; Вместимость: {mgr.dealsCount}/
                      {mgr.capacity}
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className={`font-mono text-[10px] ${
                      mgr.status === 'red'
                        ? 'border-rose-500 text-rose-400'
                        : mgr.status === 'yellow'
                          ? 'border-amber-500 text-amber-400'
                          : 'border-emerald-500 text-emerald-400'
                    }`}
                  >
                    {mgr.status === 'red'
                      ? 'ОТСТАВАНИЕ'
                      : mgr.status === 'yellow'
                        ? 'ВНИМАНИЕ'
                        : 'В НОРМЕ'}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  {/* Metric KPI chips */}
                  <div className="bg-subtle/30 grid grid-cols-3 gap-2 rounded-lg p-2 text-center">
                    <div>
                      <span className="block text-[10px] text-tertiary">
                        Звонки (факт/план)
                      </span>
                      <span className="font-mono font-semibold text-foreground">
                        {mgr.yesterdayCallsCount} / {mgr.dailyCallsTarget}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-tertiary">
                        Next Step (ИИ)
                      </span>
                      <span
                        className={`font-mono font-semibold ${
                          mgr.nextStepPct !== null &&
                          mgr.nextStepPct >= mgr.nextStepTarget
                            ? 'text-emerald-400'
                            : mgr.nextStepPct !== null && mgr.nextStepPct < 70
                              ? 'text-rose-400'
                              : 'text-amber-400'
                        }`}
                      >
                        {mgr.nextStepPct !== null ? `${mgr.nextStepPct}%` : '—'}{' '}
                        / {mgr.nextStepTarget}%
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-tertiary">
                        Zoom (факт/план)
                      </span>
                      <span className="font-mono font-semibold text-emerald-400">
                        {mgr.meetings_enabled !== false
                          ? `${mgr.zoomCount} / ${mgr.meetingsTarget}`
                          : '— (Откл.)'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-subtle/20 grid grid-cols-2 gap-2 rounded-lg p-2 text-center text-[11px]">
                    <div>
                      <span className="block text-[10px] text-tertiary">
                        Вместимость воронки
                      </span>
                      <span className="font-mono text-foreground">
                        {mgr.activeDealsCount} / {mgr.capacity} сделок
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-tertiary">
                        Выручка (факт / план)
                      </span>
                      <span className="font-mono text-foreground">
                        {mgr.revenue > 0
                          ? `${(mgr.revenue / 1000).toFixed(0)}k ₽`
                          : '0 ₽'}{' '}
                        /{' '}
                        {mgr.revTarget
                          ? `${(mgr.revTarget / 1000).toFixed(0)}k ₽`
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Single Primary Risk Alert Box */}
                  {mgr.primaryRiskCategory !== 'none' && (
                    <div
                      className={`rounded-lg border p-2.5 text-xs ${
                        mgr.status === 'red'
                          ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                        <span>{mgr.primaryRiskTitle}</span>
                      </div>
                      <div className="mt-1 font-mono text-[11px] opacity-90">
                        {mgr.primaryRiskMetric}
                      </div>
                    </div>
                  )}

                  {/* РОП Action Directive */}
                  <div className="bg-subtle/50 rounded-lg border border-subtle p-2.5">
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase text-tertiary">
                      Фокус дня для РОПа:
                    </span>
                    <p className="text-xs font-medium leading-relaxed text-foreground">
                      {mgr.actionRecommendation}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 3. Почасовая температурная карта звонков отдела (8:00 – 20:00) */}
      <DailyHourlyHeatmap calls={calls} managers={managers} />

      {/* 4. Top High-Risk Deals Requiring Immediate Action Today */}
      {highRiskDeals.length > 0 && (
        <div className="surface space-y-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <h3 className="text-sm font-semibold text-foreground">
                Ключевые сделки с риском срыва регламента (&gt;48ч без движения)
              </h3>
            </div>
            <span className="font-mono text-xs text-rose-400">
              {highRiskDeals.length} в зоне риска
            </span>
          </div>

          <div className="divide-subtle/50 divide-y overflow-hidden rounded-xl border border-subtle bg-surface">
            {highRiskDeals.map((d) => (
              <div
                key={d.id || d.deal_id}
                className="hover:bg-hover/50 flex flex-col justify-between gap-2 p-3.5 transition-colors sm:flex-row sm:items-center"
                data-testid={`risk-deal-${d.id || d.deal_id}`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {d.title ||
                        d.company_name ||
                        `Сделка #${d.crm_deal_id || d.id}`}
                    </span>
                    <Badge
                      variant="outline"
                      className="border-rose-500/30 font-mono text-[10px] text-rose-400"
                    >
                      {d.stage || 'Согласование КП'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-tertiary">
                    Ответственный:{' '}
                    <span className="font-medium text-secondary">
                      {d.responsible_user || '—'}
                    </span>{' '}
                    &bull; Источник: {d.crm_source || 'CRM'}
                  </p>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                  <span className="font-mono text-xs font-bold text-foreground">
                    {d.amount ? `${d.amount.toLocaleString('ru-RU')} ₽` : '—'}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-rose-400">
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

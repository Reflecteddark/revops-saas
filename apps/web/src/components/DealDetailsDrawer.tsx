/**
 * apps/web/src/components/DealDetailsDrawer.tsx
 *
 * Executive Deal Drawer 2.0:
 * - Enterprise Health Score & Win Probability
 * - Divergence Risk Alerts (CRM vs AI Reality)
 * - Cleaned Title auto-resolution
 * - Exact 13 B2B Audit Criteria scorecard with Whisper audio transcripts
 */

import * as React from 'react';
import {
  X,
  Phone,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Volume2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Activity,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { dealsApi } from '@/lib/api';
import {
  computeDealHealth,
  isDealClosed,
  parse13Criteria,
} from '@/lib/dealHealth';
import type { Deal, DealLinkedCall } from '@/types/api';

export interface DealDetailsDrawerProps {
  deal: Deal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId?: string;
}

export function DealDetailsDrawer({
  deal,
  open,
  onOpenChange,
  tenantId,
}: DealDetailsDrawerProps) {
  const [loading, setLoading] = React.useState(false);
  const [fullDeal, setFullDeal] = React.useState<Deal | null>(deal);
  const [expandedCallId, setExpandedCallId] = React.useState<string | null>(
    null
  );

  React.useEffect(() => {
    if (!open || !deal) {
      setFullDeal(null);
      setExpandedCallId(null);
      return;
    }

    setFullDeal(deal);
    let isMounted = true;

    // Fetch single deal detail with full linked calls payload
    setLoading(true);
    dealsApi
      .get(deal.id, tenantId)
      .then((data) => {
        if (isMounted && data) {
          setFullDeal(data);
          if (data.calls && data.calls.length > 0) {
            setExpandedCallId(data.calls[0].id);
          }
        }
      })
      .catch((err) => {
        console.warn('Could not load detailed deal info:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [deal?.id, open, tenantId]);

  if (!open || !deal) return null;

  const activeDeal = fullDeal || deal;
  const isWon = activeDeal.status === 'won' || activeDeal.stage_id === '6';
  const isLost = activeDeal.status === 'lost' || activeDeal.stage_id === '7';
  const calls: DealLinkedCall[] = activeDeal.calls || [];

  const health = computeDealHealth(activeDeal);

  return (
    <div
      className="bg-background/80 animate-in fade-in-0 fixed inset-0 z-50 flex justify-end backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
      data-testid="deal-details-drawer"
    >
      <div
        className="animate-in slide-in-from-right relative flex h-full w-full max-w-2xl flex-col border-l border-subtle bg-surface shadow-2xl transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'px-2 py-0.5 font-mono text-xs uppercase',
                  activeDeal.crm_source === 'amocrm'
                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                )}
              >
                {activeDeal.crm_source || 'CRM'}
              </Badge>
              <span className="font-mono text-xs text-tertiary">
                {activeDeal.crm_deal_id || activeDeal.id}
              </span>
            </div>
            <h2 className="text-lg font-bold text-foreground">
              {health.cleanTitle}
            </h2>
            {activeDeal.company_name &&
              activeDeal.company_name !== health.cleanTitle &&
              !activeDeal.company_name.startsWith('????') && (
                <p className="text-xs text-secondary">
                  {activeDeal.company_name}
                </p>
              )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-2 text-tertiary transition-colors hover:bg-hover hover:text-foreground"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Executive Revenue Intelligence Bar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="bg-subtle/30 space-y-1 rounded-lg border border-subtle p-3">
              <span className="text-[11px] text-tertiary">Бюджет сделки</span>
              <p className="font-mono text-base font-bold text-foreground">
                {activeDeal.amount_str ||
                  `${activeDeal.amount?.toLocaleString('ru-RU')} ₽`}
              </p>
            </div>

            <div className="bg-subtle/30 space-y-1 rounded-lg border border-subtle p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-tertiary">Health Score</span>
                <Activity className="h-3 w-3 text-primary" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    'font-mono text-base font-bold',
                    health.healthTier === 'healthy'
                      ? 'text-emerald-400'
                      : health.healthTier === 'warning'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                  )}
                >
                  {health.healthScore}
                </span>
                <span className="text-[10px] text-tertiary">/ 100</span>
              </div>
            </div>

            <div className="bg-subtle/30 space-y-1 rounded-lg border border-subtle p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-tertiary">Win Prob (ИИ)</span>
                <TrendingUp className="h-3 w-3 text-emerald-400" />
              </div>
              <p className="font-mono text-base font-bold text-foreground">
                {health.winProbability}%
              </p>
            </div>

            <div className="bg-subtle/30 space-y-1 rounded-lg border border-subtle p-3">
              <span className="text-[11px] text-tertiary">
                Воронка / Менеджер
              </span>
              <p className="truncate text-xs font-semibold text-foreground">
                {activeDeal.responsible_user ||
                  activeDeal.manager_name ||
                  'Не назначен'}
              </p>
              <p className="truncate text-[10px] text-tertiary">
                {activeDeal.pipeline_name || 'Основная воронка'}
              </p>
            </div>
          </div>

          {/* Divergence Risk Alert */}
          {health.divergenceRisk && (
            <div className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-rose-300">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
              <div className="space-y-1 text-xs leading-relaxed">
                <span className="block font-semibold text-rose-200">
                  ⚡ Риск расхождения (Divergence Alert)
                </span>
                <p>
                  Сделка находится на продвинутом этапе «
                  {activeDeal.stage_name || activeDeal.stage}», но аудиты
                  звонков или регламент SLA сигнализируют об угрозе срыва
                  переговоров.
                </p>
              </div>
            </div>
          )}

          {/* SLA Alert or Loss Reason Banner */}
          {activeDeal.sla_risk &&
            !isDealClosed(activeDeal) &&
            !health.divergenceRisk && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-300">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
                <div className="text-xs leading-relaxed">
                  <span className="font-semibold">Внимание: Риск SLA! </span>
                  Сделка находится на этапе «
                  {activeDeal.stage_name || activeDeal.stage}» без назначенного
                  следующего шага более допустимого регламентом времени.
                </div>
              </div>
            )}

          {/* AI Next Best Action recommendation */}
          <div className="border-primary/30 bg-primary/5 flex items-center justify-between rounded-lg border p-3 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
              <span className="text-secondary">
                <strong className="font-semibold text-foreground">
                  ИИ-Рекомендация РОПу:{' '}
                </strong>
                {health.aiNextAction}
              </span>
            </div>
            {health.isStalled && (
              <Badge
                variant="outline"
                className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-400"
              >
                Зависла {health.daysInStage} дн.
              </Badge>
            )}
          </div>

          {isLost && (
            <div className="space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-400">
                <XCircle className="h-4 w-4" />
                <span>Причина отказа (Loss Reason):</span>
              </div>
              <p className="text-base font-bold text-rose-200">
                {activeDeal.loss_reason || 'Отказ клиента / Провал сделки'}
              </p>
              {activeDeal.loss_reason_code && (
                <span className="font-mono text-xs text-rose-400/80">
                  Код статуса: {activeDeal.loss_reason_code}
                </span>
              )}
            </div>
          )}

          {isWon && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-sm font-semibold text-emerald-300">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span>Сделка успешно закрыта и оплачена (Closed-Won)</span>
            </div>
          )}

          {/* Linked Calls Audit Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Привязанные звонки и ИИ-аудит ({calls.length})
                </h3>
              </div>
              {activeDeal.avg_call_score ? (
                <Badge
                  variant="outline"
                  className="border-primary/30 text-xs text-primary"
                >
                  Средний балл: {Math.round(activeDeal.avg_call_score)}%
                </Badge>
              ) : null}
            </div>

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
            ) : calls.length === 0 ? (
              <div className="space-y-2 rounded-lg border border-dashed border-subtle p-6 text-center">
                <Phone className="mx-auto h-8 w-8 text-tertiary opacity-40" />
                <p className="text-sm text-secondary">
                  Звонки по этой сделке ещё не зафиксированы
                </p>
                <p className="mx-auto max-w-sm text-xs text-tertiary">
                  Звонки телефонии привязываются автоматически по номеру клиента{' '}
                  {activeDeal.contact_phone
                    ? `(${activeDeal.contact_phone})`
                    : ''}{' '}
                  или внешнему ID сделки.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {calls.map((c) => {
                  const isExpanded = expandedCallId === c.id;
                  const score = Math.round(c.overall_score || 0);
                  const scoreColor =
                    score >= 80
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                      : score >= 60
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                        : 'text-rose-400 bg-rose-500/10 border-rose-500/30';

                  const criteriaList = parse13Criteria(c.scorecard_criteria);
                  const statusLabel =
                    c.scorecard_criteria &&
                    typeof c.scorecard_criteria === 'object'
                      ? (c.scorecard_criteria as Record<string, unknown>)
                          .status_label
                      : null;

                  return (
                    <div
                      key={c.id}
                      className="bg-subtle/20 overflow-hidden rounded-lg border border-subtle transition-all"
                    >
                      {/* Call Header Row */}
                      <button
                        onClick={() =>
                          setExpandedCallId(isExpanded ? null : c.id)
                        }
                        className="flex w-full items-center justify-between p-3.5 text-left transition-colors hover:bg-hover"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono text-xs font-bold',
                              scoreColor
                            )}
                          >
                            {score}%
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-foreground">
                                {c.client_phone || 'Клиент'}
                              </span>
                              <span className="text-[11px] text-tertiary">
                                •{' '}
                                {c.duration_str || `${c.duration_seconds} сек`}
                              </span>
                              {Boolean(statusLabel) && (
                                <Badge
                                  variant="outline"
                                  className="border-rose-500/30 bg-rose-500/10 px-1.5 py-0 text-[10px] text-rose-300"
                                >
                                  {String(statusLabel)}
                                </Badge>
                              )}
                            </div>
                            <span className="text-[11px] text-tertiary">
                              {c.created_at
                                ? new Date(c.created_at).toLocaleString('ru-RU')
                                : 'Недавно'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {c.next_action_extracted && (
                            <Badge
                              variant="outline"
                              className="hidden border-emerald-500/30 text-[11px] text-emerald-400 sm:inline-flex"
                            >
                              Есть next step
                            </Badge>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-tertiary" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-tertiary" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Call Details */}
                      {isExpanded && (
                        <div className="bg-background/50 space-y-4 border-t border-subtle p-4">
                          {/* Audio Player if URL exists */}
                          {c.audio_s3_url && (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5 text-xs text-tertiary">
                                <Volume2 className="h-3.5 w-3.5 text-primary" />
                                <span>Запись звонка:</span>
                              </div>
                              <audio
                                controls
                                className="h-8 w-full"
                                src={c.audio_s3_url}
                              />
                            </div>
                          )}

                          {/* 13 B2B Audit Criteria Scorecard Grid */}
                          {criteriaList.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                                <div className="flex items-center gap-1.5">
                                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                                  <span>13 критериев B2B-аудита:</span>
                                </div>
                                <span className="font-mono text-[11px] text-tertiary">
                                  {
                                    criteriaList.filter((cr) => cr.passed)
                                      .length
                                  }{' '}
                                  / 13 пройдено
                                </span>
                              </div>
                              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                {criteriaList.map((crit) => (
                                  <div
                                    key={crit.id}
                                    className={cn(
                                      'flex items-center justify-between rounded border px-2.5 py-1.5 text-[11px]',
                                      crit.passed
                                        ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300'
                                        : 'border-rose-500/25 bg-rose-500/5 text-rose-300'
                                    )}
                                  >
                                    <span className="truncate pr-1.5 font-medium">
                                      {crit.name}
                                    </span>
                                    {crit.passed ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                                    ) : (
                                      <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* AI Summary */}
                          {c.ai_summary && (
                            <div className="bg-subtle/30 space-y-1 rounded-md border border-subtle p-3 text-xs">
                              <span className="font-semibold text-foreground">
                                Резюме диалога:
                              </span>
                              <p className="leading-relaxed text-secondary">
                                {c.ai_summary}
                              </p>
                            </div>
                          )}

                          {/* Next Action */}
                          {c.next_action_extracted && (
                            <div className="space-y-1 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
                              <span className="font-semibold text-emerald-300">
                                Следующий договорной шаг:
                              </span>
                              <p className="text-emerald-200">
                                {c.next_action_extracted}
                              </p>
                            </div>
                          )}

                          {/* Transcript */}
                          {c.transcript_text && (
                            <details className="space-y-1 text-xs text-tertiary">
                              <summary className="cursor-pointer font-medium text-secondary hover:text-foreground">
                                Показать полную расшифровку (Whisper)
                              </summary>
                              <div className="bg-subtle/40 mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded border border-subtle p-2.5 font-mono text-[11px] leading-relaxed text-secondary">
                                {c.transcript_text}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

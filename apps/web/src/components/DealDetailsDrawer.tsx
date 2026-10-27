/**
 * apps/web/src/components/DealDetailsDrawer.tsx
 *
 * Slide-over drawer displaying comprehensive deal info, custom loss reasons,
 * and all linked calls with Whisper transcripts and 13-criteria AI audit scorecards.
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { dealsApi } from '@/lib/api';
import type { Deal, DealLinkedCall } from '@/types/api';

export interface DealDetailsDrawerProps {
  deal: Deal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId?: string;
}

const CRITERIA_LABELS: Record<string, string> = {
  cr1: 'Приветствие',
  cr2: 'Квалификация',
  cr3: 'Выявление потребностей',
  cr4: 'Презентация цены',
  cr5: 'Отработка возражений',
  cr6: 'Следующий шаг',
  cr7: 'Следование скрипту',
  cr8: 'Баланс диалога',
  cr9: 'Нетоксичность',
  cr10: 'Эмпатия',
  cr11: 'Срочность',
  cr12: 'Отстройка от конкурентов',
  cr13: 'Закрытие',
  greeting: 'Приветствие',
  qualification: 'Квалификация',
  needs_analysis: 'Выявление потребностей',
  price_presentation: 'Презентация цены',
  objections: 'Отработка возражений',
  next_step: 'Следующий шаг',
  script_compliance: 'Следование скрипту',
  talk_ratio: 'Баланс диалога',
  toxicity: 'Нетоксичность',
  empathy: 'Эмпатия',
  urgency: 'Срочность',
  competitor_handling: 'Отстройка от конкурентов',
  closing: 'Закрытие',
};

export function DealDetailsDrawer({
  deal,
  open,
  onOpenChange,
  tenantId,
}: DealDetailsDrawerProps) {
  const [loading, setLoading] = React.useState(false);
  const [fullDeal, setFullDeal] = React.useState<Deal | null>(deal);
  const [expandedCallId, setExpandedCallId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !deal) {
      setFullDeal(null);
      setExpandedCallId(null);
      return;
    }

    setFullDeal(deal);
    let isMounted = true;
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

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-background/80 backdrop-blur-sm animate-in fade-in-0"
      onClick={() => onOpenChange(false)}
      data-testid="deal-details-drawer"
    >
      <div
        className="relative flex h-full w-full max-w-2xl flex-col border-l border-subtle bg-surface shadow-2xl transition-all animate-in slide-in-from-right duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle p-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  'text-xs uppercase font-mono px-2 py-0.5',
                  activeDeal.crm_source === 'amocrm'
                    ? 'border-blue-500/30 text-blue-400 bg-blue-500/10'
                    : 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                )}
              >
                {activeDeal.crm_source || 'CRM'}
              </Badge>
              <span className="font-mono text-xs text-tertiary">
                {activeDeal.crm_deal_id || activeDeal.id}
              </span>
            </div>
            <h2 className="text-lg font-bold text-foreground">
              {activeDeal.company_name || activeDeal.title}
            </h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-2 text-tertiary hover:bg-hover hover:text-foreground transition-colors"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Key Deal Stats Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-subtle bg-subtle/30 p-3 space-y-1">
              <span className="text-xs text-tertiary">Бюджет сделки</span>
              <p className="text-base font-bold text-foreground">
                {activeDeal.amount_str || `${activeDeal.amount?.toLocaleString('ru-RU')} ₽`}
              </p>
            </div>

            <div className="rounded-lg border border-subtle bg-subtle/30 p-3 space-y-1">
              <span className="text-xs text-tertiary">Воронка</span>
              <p className="text-sm font-semibold text-foreground truncate">
                {activeDeal.pipeline_name || 'Основная воронка'}
              </p>
            </div>

            <div className="rounded-lg border border-subtle bg-subtle/30 p-3 space-y-1">
              <span className="text-xs text-tertiary">Этап воронки</span>
              <p className="text-sm font-semibold text-foreground truncate">
                {activeDeal.stage_name || activeDeal.stage}
              </p>
            </div>

            <div className="rounded-lg border border-subtle bg-subtle/30 p-3 space-y-1">
              <span className="text-xs text-tertiary">Менеджер</span>
              <p className="text-sm font-semibold text-foreground truncate">
                {activeDeal.responsible_user || activeDeal.manager_name || 'Не назначен'}
              </p>
            </div>
          </div>

          {/* SLA Alert or Loss Reason Banner */}
          {activeDeal.sla_risk && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-amber-300">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold">Внимание: Риск SLA! </span>
                Сделка находится на этапе «{activeDeal.stage_name || activeDeal.stage}» без назначенного следующего шага более допустимого времени.
              </div>
            </div>
          )}

          {isLost && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                <XCircle className="h-4 w-4" />
                <span>Причина отказа (Loss Reason):</span>
              </div>
              <p className="text-base font-bold text-rose-200">
                {activeDeal.loss_reason || 'Отказ клиента / Провал сделки'}
              </p>
              {activeDeal.loss_reason_code && (
                <span className="text-xs text-rose-400/80 font-mono">
                  Код статуса: {activeDeal.loss_reason_code}
                </span>
              )}
            </div>
          )}

          {isWon && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-emerald-300 font-semibold text-sm">
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
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">
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
              <div className="rounded-lg border border-dashed border-subtle p-6 text-center space-y-2">
                <Phone className="mx-auto h-8 w-8 text-tertiary opacity-40" />
                <p className="text-sm text-secondary">
                  Звонки по этой сделке ещё не зафиксированы
                </p>
                <p className="text-xs text-tertiary max-w-sm mx-auto">
                  Звонки телефонии привязываются автоматически по номеру клиента{' '}
                  {activeDeal.contact_phone ? `(${activeDeal.contact_phone})` : ''} или внешнему ID сделки.
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

                  return (
                    <div
                      key={c.id}
                      className="rounded-lg border border-subtle bg-subtle/20 overflow-hidden transition-all"
                    >
                      {/* Call Header Row */}
                      <button
                        onClick={() =>
                          setExpandedCallId(isExpanded ? null : c.id)
                        }
                        className="flex w-full items-center justify-between p-3.5 hover:bg-hover transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono font-bold text-xs',
                              scoreColor
                            )}
                          >
                            {score}%
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-foreground">
                                {c.client_phone || 'Клиент'}
                              </span>
                              <span className="text-[11px] text-tertiary">
                                • {c.duration_str || `${c.duration_seconds} сек`}
                              </span>
                            </div>
                            <span className="text-[11px] text-tertiary">
                              {c.created_at ? new Date(c.created_at).toLocaleString('ru-RU') : 'Недавно'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {c.next_action_extracted && (
                            <Badge
                              variant="outline"
                              className="text-[11px] border-emerald-500/30 text-emerald-400 hidden sm:inline-flex"
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
                        <div className="border-t border-subtle p-4 space-y-4 bg-background/50">
                          {/* Audio Player if URL exists */}
                          {c.audio_s3_url && (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5 text-xs text-tertiary">
                                <Volume2 className="h-3.5 w-3.5 text-primary" />
                                <span>Запись звонка:</span>
                              </div>
                              <audio
                                controls
                                className="w-full h-8"
                                src={c.audio_s3_url}
                              />
                            </div>
                          )}

                          {/* 13 Criteria Scorecard Grid */}
                          {c.scorecard_criteria &&
                            Object.keys(c.scorecard_criteria).length > 0 && (
                              <div className="space-y-2">
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                                  <span>13 критериев B2B-аудита:</span>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                                  {Object.entries(c.scorecard_criteria).map(
                                    ([k, val]) => {
                                      const passed = Number(val) === 1;
                                      const label =
                                        CRITERIA_LABELS[k] ||
                                        k.toUpperCase();
                                      return (
                                        <div
                                          key={k}
                                          className={cn(
                                            'flex items-center justify-between rounded px-2 py-1 text-[11px] border',
                                            passed
                                              ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                                              : 'border-rose-500/20 bg-rose-500/5 text-rose-300'
                                          )}
                                        >
                                          <span className="truncate pr-1">
                                            {label}
                                          </span>
                                          {passed ? (
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                          ) : (
                                            <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                                          )}
                                        </div>
                                      );
                                    }
                                  )}
                                </div>
                              </div>
                            )}

                          {/* AI Summary */}
                          {c.ai_summary && (
                            <div className="space-y-1 rounded-md border border-subtle bg-subtle/30 p-3 text-xs">
                              <span className="font-semibold text-foreground">
                                Резюме диалога:
                              </span>
                              <p className="text-secondary leading-relaxed">
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
                            <details className="text-xs space-y-1 text-tertiary">
                              <summary className="cursor-pointer font-medium text-secondary hover:text-foreground">
                                Показать полную расшифровку (Whisper)
                              </summary>
                              <div className="mt-2 max-h-48 overflow-y-auto rounded border border-subtle bg-subtle/40 p-2.5 font-mono text-[11px] leading-relaxed text-secondary whitespace-pre-wrap">
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

export default DealDetailsDrawer;

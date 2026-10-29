/**
 * apps/web/src/components/CallDetailsDrawer.tsx
 *
 * Slide-over drawer (Linear / GitHub style) for deep call inspection.
 * Displays call audio/metadata, 13 CR scorecard, ROP recommendations,
 * and speaker dialogue transcript without blocking the underlying page.
 */

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  X,
  PhoneCall,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Sparkles,
  AlertTriangle,
  Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CR_LABELS, CR_DEFINITIONS } from '@/pages/AuditPage';
import { cn } from '@/lib/utils';
import type { Call } from '@/types/api';

export interface CallDetailsDrawerProps {
  call: Call | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CallDetailsDrawer({ call, open, onOpenChange }: CallDetailsDrawerProps) {
  const [copiedTranscript, setCopiedTranscript] = React.useState(false);
  const [copiedScript, setCopiedScript] = React.useState(false);

  if (!call) return null;

  const score = call.score ?? (call as any)?.overall_score;
  const isGood = score !== null && score !== undefined && score >= 9;
  const isMid = score !== null && score !== undefined && score >= 6;
  const scoreBadgeColor = isGood
    ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
    : isMid
    ? 'bg-amber-500/10 text-amber-400 ring-amber-500/20'
    : 'bg-rose-500/10 text-rose-400 ring-rose-500/20';

  const handleCopyTranscript = async () => {
    if (!call.transcript) return;
    try {
      await navigator.clipboard.writeText(call.transcript);
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    } catch {
      // Fallback if clipboard API restricted
    }
  };

  const handleCopyScript = async () => {
    if (!call.recommendation) return;
    try {
      await navigator.clipboard.writeText(call.recommendation);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Backdrop */}
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />

        {/* Slide-over Content */}
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-strong surface-raised shadow-2xl duration-300',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right'
          )}
          data-testid="call-details-drawer"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-subtle p-5">
            <div className="space-y-1.5 min-w-0 pr-6">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogPrimitive.Title className="text-base font-semibold text-foreground truncate">
                  {call.deal_title || call.client || 'Звонок'}
                </DialogPrimitive.Title>
                {score !== null && score !== undefined && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset tabular-nums',
                      scoreBadgeColor
                    )}
                  >
                    Балл: {score}/13
                  </span>
                )}
                {call.status === 'won' && (
                  <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                    Успешно
                  </span>
                )}
                {(call.status === 'lost' || call.status === 'risk') && (
                  <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-rose-500/10 text-rose-400 ring-1 ring-inset ring-rose-500/20">
                    Слив
                  </span>
                )}
              </div>

              {/* Metadata row */}
              <div className="flex items-center gap-4 text-xs text-secondary flex-wrap">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-tertiary" />
                  <span>{call.manager || 'Менеджер'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-tertiary" />
                  <span>{call.date || call.created_at || '—'}</span>
                </div>
                {call.duration && (
                  <div className="flex items-center gap-1.5">
                    <PhoneCall className="h-3.5 w-3.5 text-tertiary" />
                    <span>{call.duration}</span>
                  </div>
                )}
                {call.amount_num && call.amount_num > 0 && (
                  <div className="font-mono font-medium text-foreground tabular-nums">
                    {call.amount_num.toLocaleString('ru-RU')} ₽
                  </div>
                )}
              </div>
            </div>

            {/* Close Button */}
            <DialogPrimitive.Close className="rounded-lg p-1.5 text-tertiary transition-colors hover:bg-hover hover:text-foreground focus:outline-none">
              <X className="h-4 w-4" />
              <span className="sr-only">Закрыть</span>
            </DialogPrimitive.Close>
          </div>

          {/* Body with Scroll */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Audio Player if URL exists */}
            {(call.audio_url || (call as any).audio_s3_url) && (
              <div className="space-y-1.5 rounded-xl border border-subtle bg-surface/50 p-3">
                <div className="flex items-center gap-1.5 text-xs text-secondary font-medium">
                  <Volume2 className="h-4 w-4 text-primary" />
                  <span>Аудиозапись диалога:</span>
                </div>
                <audio
                  controls
                  className="h-8 w-full"
                  src={call.audio_url || (call as any).audio_s3_url}
                  data-testid="drawer-call-audio-player"
                />
              </div>
            )}

            {/* ROP Recommendation & Script */}
            {call.recommendation && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Рекомендация РОПа
                    </h4>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyScript}
                    className="h-6 text-[11px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 px-2"
                  >
                    {copiedScript ? (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        Скопировано
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3 mr-1" />
                        Скопировать скрипт
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-secondary leading-relaxed">
                  {call.recommendation}
                </p>
              </div>
            )}

            {/* Error Summary */}
            {call.error_summary && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400">
                    Причина риска / Ошибка диалога
                  </h4>
                </div>
                <p className="text-xs text-secondary leading-relaxed">
                  {call.error_summary}
                </p>
              </div>
            )}

            {/* 13 CR Scorecard */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-tertiary">
                  Чек-лист 13 стандартов B2B-аудита
                </h4>
                {score !== null && score !== undefined && (
                  <span className="text-xs text-secondary font-mono">
                    Выполнено: <span className="font-semibold text-foreground">{score}</span> / 13
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="cr-criteria-grid">
                {Array.from({ length: 13 }).map((_, idx) => {
                  const val = call.cr?.[idx];
                  const label = CR_LABELS[idx] || `Критерий ${idx + 1}`;
                  const isPassed = val === 1;
                  const isFailed = val === 0;

                  return (
                    <div
                      key={idx}
                      title={CR_DEFINITIONS[idx]?.description}
                      className={cn(
                        'flex items-center justify-between rounded-lg p-2.5 text-xs border transition-colors cursor-help',
                        isPassed
                          ? 'border-emerald-500/20 bg-emerald-500/[0.04] text-foreground'
                          : isFailed
                          ? 'border-rose-500/20 bg-rose-500/[0.04] text-foreground'
                          : 'border-subtle bg-hover/40 text-secondary'
                      )}
                    >
                      <span className="font-medium truncate pr-2">
                        {idx + 1}. {label}
                      </span>
                      {isPassed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : isFailed ? (
                        <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                      ) : (
                        <span className="text-xs text-tertiary shrink-0">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dialogue Transcript */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-tertiary">
                  Транскрипт диалога
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyTranscript}
                  className="h-6 text-[11px] text-secondary hover:text-foreground px-2"
                >
                  {copiedTranscript ? (
                    <>
                      <Check className="h-3 w-3 mr-1 text-emerald-400" />
                      Скопировано
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" />
                      Скопировать текст
                    </>
                  )}
                </Button>
              </div>

              <pre
                className="whitespace-pre-wrap font-sans text-xs bg-hover/60 p-4 rounded-xl border border-subtle text-foreground leading-relaxed overflow-x-auto"
                data-testid="call-transcript"
              >
                {call.transcript || 'Транскрипт отсутствует'}
              </pre>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default CallDetailsDrawer;

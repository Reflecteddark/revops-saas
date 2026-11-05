/**
 * apps/web/src/components/CallCriteriaChecklist.tsx
 *
 * The 13 criteria of one call, the same in the audit page and in the Pulse panel. (The deal card reads the criteria of
 * its calls with its own parser, lib/dealHealth.ts: it shows "н/п" and no marks for an unrated call, nothing more.)
 * - 1 passed, 0 failed, "н/п" the criterion did not apply to this call (CR5, CR6, CR13: the client did not raise the
 *   topic), "—" no data (an old call, or no rating);
 * - a criterion with the AI's reason and quote opens on click; the quote was checked against the transcript on the
 *   server, a quote that was not found is not sent at all;
 * - "Passed 6 of 10 applicable" says how the score was counted when something did not apply.
 */

import * as React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { callKind } from '@/lib/callStats';
import { CR_DEFINITIONS } from '@/lib/criteria';
import type { Call } from '@/types/api';

export function CallCriteriaChecklist({ call }: { call: Call }) {
  const [open, setOpen] = React.useState<number | null>(null);

  // another call in the same card: nothing stays expanded
  React.useEffect(() => setOpen(null), [call.id]);

  const assessed = callKind(call) === 'assessed'; // an unanswered or unread call has no "did not apply", only no data
  const showBasis =
    typeof call.applicable === 'number' && typeof call.passed === 'number' && call.applicable < 13;

  return (
    <div className="space-y-2">
      {showBasis && (
        <p className="text-xs text-secondary" data-testid="cr-basis">
          Пройдено {call.passed} из {call.applicable} применимых: оставшиеся критерии не относились к этому звонку,
          балл пересчитан на 13.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="cr-criteria-grid">
        {CR_DEFINITIONS.map((def, idx) => {
          const val = call.cr?.[idx];
          const na = assessed && val === null && def.naHint !== undefined;
          const ev = call.evidence?.[def.id];
          const hasDetail = Boolean(ev?.why || ev?.quote) || na;
          const isOpen = open === idx;
          const colorClass =
            val === 1
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
              : val === 0
                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                : 'bg-hover border-subtle text-muted-foreground';

          return (
            <div
              key={def.id}
              data-testid={`cr-item-${idx + 1}`}
              className={`rounded-md border text-xs transition-colors ${colorClass} ${isOpen ? 'sm:col-span-2' : ''}`}
            >
              <button
                type="button"
                disabled={!hasDetail}
                aria-expanded={hasDetail ? isOpen : undefined}
                onClick={() => setOpen(isOpen ? null : idx)}
                title={na ? `Не применимо: ${def.naHint}` : def.description}
                className={`flex w-full items-center justify-between p-2 text-left ${hasDetail ? 'cursor-pointer' : 'cursor-help'}`}
              >
                <span className="flex items-center space-x-2 truncate">
                  <span className="shrink-0 font-mono font-bold">CR{idx + 1}</span>
                  <span className="truncate text-foreground/90">{def.label}</span>
                </span>
                <span className="ml-2 flex shrink-0 items-center gap-1 font-mono font-bold">
                  {val === 1 ? '1' : val === 0 ? '0' : na ? 'н/п' : '—'}
                  {hasDetail && (isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                </span>
              </button>
              {isOpen && (
                <div className="space-y-1.5 border-t border-current/10 p-2 text-foreground/90" data-testid={`cr-detail-${idx + 1}`}>
                  {ev?.why ? <p>{ev.why}</p> : na ? <p>Не применимо: {def.naHint}.</p> : null}
                  {ev?.quote && (
                    <blockquote className="border-l-2 border-current/30 pl-2 italic text-muted-foreground">
                      «{ev.quote}»
                    </blockquote>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CallCriteriaChecklist;

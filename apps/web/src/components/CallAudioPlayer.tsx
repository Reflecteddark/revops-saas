/**
 * apps/web/src/components/CallAudioPlayer.tsx
 *
 * The recording of a call. The browser never gets the stored link (it may be a signed link of the telephony
 * provider, and an <audio> element cannot send our login): the file is fetched through GET /calls/{id}/audio with
 * the user's session when the user asks for it, so opening a card does not download several megabytes.
 */

import * as React from 'react';
import { Loader2, Play, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { callsApi } from '@/lib/api';

type PlayerState = 'idle' | 'loading' | 'ready' | 'error';

export interface CallAudioPlayerProps {
  callId: string;
  hasAudio?: boolean;
  testId?: string;
}

export function CallAudioPlayer({ callId, hasAudio, testId = 'call-audio-player' }: CallAudioPlayerProps) {
  const [state, setState] = React.useState<PlayerState>('idle');
  const [src, setSrc] = React.useState<string | null>(null);
  const srcRef = React.useRef<string | null>(null);
  const askRef = React.useRef(0); // which request is the current one: an answer of an older one is dropped

  const release = React.useCallback(() => {
    if (srcRef.current) URL.revokeObjectURL(srcRef.current);
    srcRef.current = null;
  }, []);

  // another call opened in the same card, or the card closed: drop the previous file and any request still on its way
  React.useEffect(() => {
    setState('idle');
    setSrc(null);
    return () => {
      askRef.current += 1;
      release();
    };
  }, [callId, release]);

  if (!hasAudio) return null;

  const load = async () => {
    const ask = ++askRef.current;
    setState('loading');
    try {
      const blob = await callsApi.audio(callId);
      if (ask !== askRef.current) return; // the card moved on while the file was coming
      release();
      srcRef.current = URL.createObjectURL(blob);
      setSrc(srcRef.current);
      setState('ready');
    } catch {
      if (ask === askRef.current) setState('error');
    }
  };

  return (
    <div className="space-y-1.5 rounded-lg border border-subtle bg-hover p-3" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-secondary">
        <Volume2 className="h-4 w-4 text-primary" />
        <span>Запись разговора</span>
      </div>
      {state === 'ready' && src ? (
        <audio controls autoPlay className="h-8 w-full" src={src} data-testid={`${testId}-audio`} />
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={load} disabled={state === 'loading'} data-testid={`${testId}-play`}>
          {state === 'loading' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
          {state === 'loading' ? 'Загружаю запись…' : state === 'error' ? 'Повторить' : 'Прослушать запись'}
        </Button>
      )}
      {state === 'error' && (
        <p className="text-xs text-amber-500" role="alert">
          Запись недоступна: ссылка телефонии могла устареть или закрыться.
        </p>
      )}
    </div>
  );
}

export default CallAudioPlayer;

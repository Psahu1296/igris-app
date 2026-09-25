import { useCallback, useRef, useState } from 'react';
import { PermissionsAndroid, ToastAndroid } from 'react-native';

import type { Lane } from '@/lib/config';
import { getListener, phoneCanListen, type Listener } from '@/lib/voice/stt';

/**
 * Listening, for screens that want to be talked to.
 *
 * Unlike speech, listening is never a courtesy: the user pressed a button and is now
 * talking at a phone, so silence has to be explained. Failures surface.
 *
 * Transcription prefers the Mac (maestro's /stt, Whisper — Render has none). When the
 * Mac cannot be reached, the phone's own recogniser takes over, and a toast says so:
 * the mic used to just vanish off the composer on the cloud lane, and failures were
 * kept in `problem` with nothing on screen reading it (2026-09-25).
 */

export type ListenState = 'idle' | 'listening' | 'transcribing';

export function useListening(lane: Lane, macReachable: boolean) {
  const [state, setState] = useState<ListenState>('idle');
  const [problem, setProblemState] = useState<string | null>(null);
  // Every problem is also a toast: the user pressed the mic and is looking at it.
  const setProblem = useCallback((message: string | null) => {
    setProblemState(message);
    if (message) ToastAndroid.show(message, ToastAndroid.LONG);
  }, []);
  const toldFallback = useRef(false);
  // Held in a ref so a re-render mid-utterance cannot swap the callback out from
  // under the native audio thread.
  const onDone = useRef<((text: string) => void) | null>(null);
  const active = useRef<Listener | null>(null);

  const onMac = lane === 'local' && macReachable;
  const available = onMac || phoneCanListen();

  const stop = useCallback(async () => {
    setState('idle');
    const listener = active.current;
    active.current = null;
    if (listener) await listener.stop().catch(() => {});
  }, []);

  const start = useCallback(
    async (onTranscript: (text: string) => void) => {
      if (!available) {
        setProblem("The Mac is offline and this phone has no speech recogniser. Type instead.");
        return;
      }

      // Android 6+ needs this at runtime; the manifest entry alone is not enough,
      // and capture fails with an opaque native error without it.
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setProblem('Igris needs the microphone to listen.');
        return;
      }

      setProblem(null);
      onDone.current = onTranscript;

      if (!onMac && !toldFallback.current) {
        toldFallback.current = true;
        ToastAndroid.show("Mac offline: using the phone's speech recognition.", ToastAndroid.SHORT);
      }
      const listener = getListener(lane, macReachable);
      active.current = listener;

      try {
        await listener.start({
          onTranscribing: () => setState('transcribing'),
          onFinal: (text) => {
            setState('idle');
            active.current = null;
            const deliver = onDone.current;
            onDone.current = null;
            // Empty means nothing was said, or transcription failed and onError has
            // already explained why. Either way, do not send maestro an empty turn.
            if (deliver && text.trim()) deliver(text.trim());
          },
          onError: (err) => setProblem(err.message),
        });
        setState('listening');
      } catch (err) {
        setState('idle');
        active.current = null;
        setProblem(err instanceof Error ? err.message : 'Igris could not start listening.');
      }
    },
    [available, lane, macReachable, onMac, setProblem]
  );

  return { available, state, problem, start, stop };
}

import { useCallback, useRef, useState } from 'react';
import { PermissionsAndroid } from 'react-native';

import type { Lane } from '@/lib/config';
import { getListener, type Listener } from '@/lib/voice/stt';

/**
 * Listening, for screens that want to be talked to.
 *
 * Unlike speech, listening is never a courtesy: the user pressed a button and is now
 * talking at a phone, so silence has to be explained. Failures surface.
 *
 * There is no model to download and no readiness check, because the phone does not
 * transcribe — see stt.ts. What it does need is the Mac: transcription goes to
 * maestro's /stt, which Render does not have.
 */

export type ListenState = 'idle' | 'listening' | 'transcribing';

export function useListening(lane: Lane) {
  const [state, setState] = useState<ListenState>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  // Held in a ref so a re-render mid-utterance cannot swap the callback out from
  // under the native audio thread.
  const onDone = useRef<((text: string) => void) | null>(null);
  const active = useRef<Listener | null>(null);

  // Only the Mac has Whisper. Offering a mic that always fails on Render would be
  // worse than not offering one.
  const available = lane === 'local';

  const stop = useCallback(async () => {
    setState('idle');
    const listener = active.current;
    active.current = null;
    if (listener) await listener.stop().catch(() => {});
  }, []);

  const start = useCallback(
    async (onTranscript: (text: string) => void) => {
      if (!available) {
        setProblem('Transcription needs the Mac. Igris is on Render right now.');
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

      const listener = getListener(lane);
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
    [available, lane]
  );

  return { available, state, problem, start, stop };
}

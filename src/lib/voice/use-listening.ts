import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid } from 'react-native';

import { fetchManifest, type AssetSpec } from '@/lib/assets/manifest';
import { getListener, listeningStatus, releaseListener } from '@/lib/voice/stt';

/**
 * Listening, for screens that want to be talked to.
 *
 * Unlike speech, listening is never a courtesy: the user pressed a button and is
 * now talking at a phone, so silence has to be explained. Failures surface.
 */

export type ListenState = 'idle' | 'starting' | 'listening';

export function useListening() {
  const [ears, setEars] = useState<AssetSpec | null>(null);
  const [state, setState] = useState<ListenState>('idle');
  const [partial, setPartial] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // The resolved transcript is delivered through a ref so a re-render mid-utterance
  // cannot swap the callback out from under the native audio thread.
  const onDone = useRef<((text: string) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchManifest()
      .then((manifest) => {
        if (!cancelled) setEars(manifest.assets.find((a) => a.id === 'ears') ?? null);
      })
      .catch(() => setProblem('Could not read the asset manifest.'));

    return () => {
      cancelled = true;
      void releaseListener();
    };
  }, []);

  /**
   * Readiness is a filesystem check, so it cannot be computed during render and be
   * trusted: downloading a model does not re-render this screen, and the mic button
   * stayed hidden until the app was restarted. Re-read it on mount and on every
   * focus, which is exactly when the user comes back from the download screen.
   */
  const refreshReady = useCallback(() => {
    setReady(ears !== null && listeningStatus(ears).ready);
  }, [ears]);

  // useFocusEffect runs on first focus too, and re-runs when the callback's
  // identity changes — which is exactly when the manifest fetch resolves. So it
  // covers mount and return-from-download without a second effect.
  useFocusEffect(refreshReady);

  const available = ready;

  const stop = useCallback(async () => {
    if (!ears) return;
    setState('idle');
    try {
      const listener = await getListener(ears);
      await listener.stop();
    } catch {
      // Not listening, or the engine is already released. Both are fine.
    }
  }, [ears]);

  const start = useCallback(
    async (onTranscript: (text: string) => void) => {
      if (!ears) {
        setProblem('No speech model is listed in the asset manifest.');
        return;
      }
      const status = listeningStatus(ears);
      if (!status.ready) {
        setProblem(status.reason);
        return;
      }

      // Android 6+ needs this at runtime; the manifest entry alone is not enough,
      // and sherpa's capture will fail with an opaque native error without it.
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setProblem('Igris needs the microphone to listen.');
        return;
      }

      setProblem(null);
      setPartial('');
      setState('starting');
      onDone.current = onTranscript;

      try {
        const listener = await getListener(ears);
        await listener.start({
          onPartial: setPartial,
          onFinal: (text) => {
            setState('idle');
            setPartial('');
            const deliver = onDone.current;
            onDone.current = null;
            // An empty transcript means the endpoint fired on silence. Say nothing
            // rather than sending maestro an empty turn.
            if (deliver && text.trim()) deliver(text.trim());
          },
          onError: (err) => {
            setState('idle');
            setProblem(err.message);
          },
        });
        setState('listening');
      } catch (err) {
        setState('idle');
        setProblem(err instanceof Error ? err.message : 'Igris could not start listening.');
      }
    },
    [ears]
  );

  return { available, state, partial, problem, start, stop };
}

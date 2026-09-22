import { useCallback, useEffect, useState } from 'react';

import { fetchManifest, type AssetSpec } from '@/lib/assets/manifest';
import { getSpeaker, releaseSpeaker, speechStatus } from '@/lib/voice/tts';

/**
 * Speaking, for screens that have something to say.
 *
 * Speech is a courtesy, not the contract: if the voice is missing, the engine
 * fails, or audio is unavailable, the answer is still on screen. So failures here
 * are reported quietly and never interrupt the conversation.
 */
export function useSpeech() {
  const [voice, setVoice] = useState<AssetSpec | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchManifest()
      .then((manifest) => {
        if (!cancelled) setVoice(manifest.assets.find((a) => a.id === 'voice') ?? null);
      })
      .catch(() => {
        // The transcript works fine without a voice; don't surface a network
        // failure that only affects whether answers are read aloud.
      });

    return () => {
      cancelled = true;
      void releaseSpeaker();
    };
  }, []);

  const available = voice !== null && speechStatus(voice).ready;

  const speak = useCallback(
    async (text: string) => {
      if (!voice || !speechStatus(voice).ready) return;
      try {
        const tts = await getSpeaker(voice);
        await tts.speak(text);
        setProblem(null);
      } catch (err) {
        setProblem(err instanceof Error ? err.message : 'Igris could not speak that.');
      }
    },
    [voice]
  );

  const stop = useCallback(async () => {
    if (!voice || !speechStatus(voice).ready) return;
    try {
      const tts = await getSpeaker(voice);
      await tts.stop();
    } catch {
      // Nothing was playing, or the engine is already gone. Either is fine.
    }
  }, [voice]);

  return { available, speak, stop, problem };
}

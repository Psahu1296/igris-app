import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { fetchManifest, type AssetSpec } from '@/lib/assets/manifest';
import { getSpeaker, releaseSpeaker, speechStatus } from '@/lib/voice/tts';

/**
 * Which turn is being spoken right now, shared across every useSpeech() instance.
 *
 * There is one speaker (tts.ts keeps a single engine) but several callers: the
 * transcript auto-speaks each answer, and every turn card has its own Speak button.
 * So "is THIS turn being spoken" cannot live in any one hook's state. A module store
 * read through useSyncExternalStore is the smallest thing that gives every card the
 * same answer. It drives the loader's `answering` state.
 */
let speakingId: string | null = null;
const listeners = new Set<() => void>();

function setSpeaking(id: string | null) {
  speakingId = id;
  listeners.forEach((notify) => notify());
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};

/** The id passed to speak() for the utterance currently playing, or null. */
export function useSpeakingId(): string | null {
  return useSyncExternalStore(subscribe, () => speakingId);
}

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

  // Same filesystem-readiness trap as useListening: a download does not re-render
  // this screen, so re-read on mount and on focus rather than during render.
  const [ready, setReady] = useState(false);
  const refreshReady = useCallback(() => {
    setReady(voice !== null && speechStatus(voice).ready);
  }, [voice]);

  // useFocusEffect runs on first focus too, and re-runs when the callback's
  // identity changes — which is exactly when the manifest fetch resolves. So it
  // covers mount and return-from-download without a second effect.
  useFocusEffect(refreshReady);

  const available = ready;

  const speak = useCallback(
    async (text: string, id?: string) => {
      if (!voice || !speechStatus(voice).ready) return;
      const owner = id ?? null;
      setSpeaking(owner);
      try {
        const tts = await getSpeaker(voice);
        await tts.speak(text);
        setProblem(null);
      } catch (err) {
        setProblem(err instanceof Error ? err.message : 'Igris could not speak that.');
      } finally {
        // speak() cancels whatever was playing, so a newer utterance may already own
        // the speaker. Only clear the flag if it is still ours.
        if (speakingId === owner) setSpeaking(null);
      }
    },
    [voice]
  );

  const stop = useCallback(async () => {
    if (!voice || !speechStatus(voice).ready) return;
    try {
      const tts = await getSpeaker(voice);
      await tts.stop();
      setSpeaking(null);
    } catch {
      // Nothing was playing, or the engine is already gone. Either is fine.
    }
  }, [voice]);

  return { available, speak, stop, problem };
}

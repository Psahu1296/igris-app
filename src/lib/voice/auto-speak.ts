import { useSyncExternalStore } from 'react';

import { loadAutoSpeak, saveAutoSpeak } from '@/lib/secure';

/**
 * Whether each answer is read aloud as it arrives. The header's speaker button flips
 * it; the Speak button on a card and "read my messages" speak either way, because
 * those are asked for.
 *
 * A module store, like useSpeakingId in use-speech.ts: the header sets it and the
 * conversation hook reads it, and neither should own the other. Loaded once from
 * SecureStore at import; until that resolves it reads as on, the default.
 */
let on = true;
const listeners = new Set<() => void>();

void loadAutoSpeak()
  .then((saved) => set(saved, false))
  .catch(() => {});

function set(value: boolean, persist = true) {
  on = value;
  listeners.forEach((notify) => notify());
  if (persist) void saveAutoSpeak(value).catch(() => {});
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};

/** Read at the moment an answer arrives, so a toggle mid-turn is honoured. */
export const autoSpeakOn = () => on;

export function useAutoSpeak(): [boolean, (value: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => on), set];
}

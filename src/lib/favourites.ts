import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { ALIASES, lastDigits, spokenName, type Contact } from '@/lib/device';

/**
 * Quick-call contacts: the people Igris may ring WITHOUT a tap.
 *
 * Everyone else goes through the confirm card. A favourite skips it — but still gets
 * a short cancellable countdown (COUNTDOWN_MS), because the name came through speech
 * recognition and a misheard "call Rahul" should cost a tap on Cancel, not an
 * awkward call.
 *
 * Phone-only, in SecureStore: these are names and numbers from the address book, and
 * maestro never needs them — it sends a name, the phone resolves it.
 */

export type Favourite = Contact & {
  /** What you call them, when it differs from the contact name: "mom" for "Mummy". */
  alias: string | null;
};

export const COUNTDOWN_MS = 3000;

const KEY = 'igris.favourites';

// A module store, like the speaking id in use-speech.ts: the home screen, the call
// card and the Favourites screen all read one list, and a star anywhere updates all.
let favourites: Favourite[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit(next: Favourite[]) {
  favourites = next;
  listeners.forEach((l) => l());
  void SecureStore.setItemAsync(KEY, JSON.stringify(next));
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (raw) {
      favourites = JSON.parse(raw) as Favourite[];
      listeners.forEach((l) => l());
    }
  } catch {
    // Unreadable store: start empty rather than crash the transcript.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void load();
  return () => listeners.delete(listener);
}

export function useFavourites(): Favourite[] {
  return useSyncExternalStore(subscribe, () => favourites);
}

const same = (a: Contact, b: Contact) => lastDigits(a.number) === lastDigits(b.number);

export const isFavourite = (list: Favourite[], contact: Contact) => list.some((f) => same(f, contact));

export function toggleFavourite(contact: Contact) {
  emit(
    isFavourite(favourites, contact)
      ? favourites.filter((f) => !same(f, contact))
      : [...favourites, { ...contact, alias: null }]
  );
}

export function setAlias(contact: Contact, alias: string) {
  const clean = alias.trim().toLowerCase();
  emit(favourites.map((f) => (same(f, contact) ? { ...f, alias: clean || null } : f)));
}

/**
 * The one favourite a spoken name means, or null. Strict on purpose — exact alias,
 * exact name, or exact first name, and only when exactly ONE favourite fits. Two
 * favourite Rahuls fall through to the confirm card; auto-dialling a guess is the
 * thing this whole list must never do.
 */
export async function matchFavourite(name: string | null, number: string | null): Promise<Favourite | null> {
  await load();
  if (number) return favourites.find((f) => lastDigits(f.number) === lastDigits(number)) ?? null;
  if (!name) return null;

  const said = name.trim().toLowerCase();
  const heard = ALIASES.find((group) => group.includes(said)) ?? [said];
  const hits = favourites.filter((f) => {
    const full = spokenName(f.name);
    return (
      (f.alias !== null && heard.includes(f.alias)) ||
      heard.includes(full) ||
      heard.includes(full.split(/\s+/)[0])
    );
  });
  return hits.length === 1 ? hits[0] : null;
}

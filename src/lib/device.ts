import { PermissionsAndroid, Platform } from 'react-native';

import IgrisDevice, { type NativeContact } from '../../modules/igris-device';

/**
 * Actions maestro asks the phone to perform (maestro/agents/device.py).
 *
 * maestro decides WHAT; this file does it, because only the phone can. The split is a
 * tool call whose tool runs on the client: the model never touches Android, and the
 * app never guesses intent.
 *
 * What Android allows, measured on the OnePlus 11R (ColorOS, 2026-09-24):
 *   SET_ALARM       works silently (SKIP_UI) — Igris stays on screen
 *   DISMISS_ALARM   ignored, for upcoming AND ringing alarms — it only opens the list
 * So there is no 'alarm.cancel': maestro answers those with 'alarm.list' and says why.
 */

/** Sent with every /chat/stream request, so maestro only plans what this app can do. */
export const DEVICE_CAPABILITIES = ['alarm', 'call', 'notify'];

export type DeviceAction =
  | { kind: 'alarm.set'; hour: number; minute: number; label: string | null }
  | { kind: 'alarm.list' }
  /** Press a RINGING alarm's Snooze or Dismiss (lib/notifications.ts). */
  | { kind: 'alarm.stop'; snooze: boolean }
  /** Read what is in the shade aloud — on the phone; maestro never sees it. */
  | { kind: 'notify.read'; from: string | null }
  /** `to` null = the most recent conversation. Always confirmed before sending. */
  | { kind: 'notify.reply'; to: string | null; text: string }
  /** maestro sends a name OR a number; the phone resolves names in its own contacts. */
  | { kind: 'call'; name: string | null; number: string | null };

export type Contact = NativeContact;

/** A chat notification, flattened for display and speech (lib/notifications.ts). */
export type Conversation = {
  key: string;
  app: string;
  title: string;
  lines: { sender: string | null; text: string }[];
  postedAt: number;
  canReply: boolean;
};

/**
 * What the transcript shows under the answer: the action and whether it happened.
 * A call pauses at 'confirm' with its candidates until the user picks one or cancels
 * — nothing rings on maestro's word alone. A quick-call favourite pauses at
 * 'countdown' instead: it rings when the countdown ends, unless cancelled.
 */
export type DeviceStep = {
  action: DeviceAction;
  status: 'running' | 'confirm' | 'countdown' | 'done' | 'failed' | 'cancelled';
  detail: string | null;
  candidates?: Contact[];
  /** 'countdown' only: when a favourite is rung unless cancelled (lib/favourites.ts). */
  deadline?: number;
  /**
   * notify.read: what was read out. notify.reply: who it could go to — the card
   * waits at 'confirm' like a call. Held in memory only; never sent or saved.
   */
  conversations?: Conversation[];
};

/**
 * The action comes off the network, so it is checked before it can start an intent —
 * a malformed one is dropped, not half-performed.
 */
export function parseDeviceAction(raw: unknown): DeviceAction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Record<string, unknown>;
  if (a.kind === 'alarm.list') return { kind: 'alarm.list' };
  const text = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
  if (a.kind === 'alarm.stop') return { kind: 'alarm.stop', snooze: a.snooze === true };
  if (a.kind === 'notify.read') return { kind: 'notify.read', from: text(a.from, 60) };
  if (a.kind === 'notify.reply') {
    const body = text(a.text, 500);
    return body ? { kind: 'notify.reply', to: text(a.to, 60), text: body } : null;
  }
  if (a.kind === 'call') {
    const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim().slice(0, 60) : null;
    const number =
      typeof a.number === 'string' && /^\+?\d{3,15}$/.test(a.number) ? a.number : null;
    return name || number ? { kind: 'call', name, number } : null;
  }
  if (
    a.kind === 'alarm.set' &&
    Number.isInteger(a.hour) &&
    Number.isInteger(a.minute) &&
    (a.hour as number) >= 0 &&
    (a.hour as number) <= 23 &&
    (a.minute as number) >= 0 &&
    (a.minute as number) <= 59
  ) {
    return {
      kind: 'alarm.set',
      hour: a.hour as number,
      minute: a.minute as number,
      label: typeof a.label === 'string' && a.label ? a.label.slice(0, 60) : null,
    };
  }
  return null;
}

/** "6:30 AM" — the same form maestro speaks, so the chip and the voice agree. */
export function clockLabel(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function describeAction(action: DeviceAction): string {
  switch (action.kind) {
    case 'alarm.set':
      return `Alarm · ${clockLabel(action.hour, action.minute)}${action.label ? ` · ${action.label}` : ''}`;
    case 'alarm.list':
      return 'Opened your alarms';
    case 'alarm.stop':
      return action.snooze ? 'Snooze alarm' : 'Stop alarm';
    case 'notify.read':
      return action.from ? `Messages · ${action.from}` : 'Messages';
    case 'notify.reply':
      return `Reply · ${action.to ?? 'latest'}`;
    case 'call':
      return `Call · ${action.name ?? action.number}`;
  }
}

/**
 * Perform it. Resolves with a line for the chip; throws with a readable reason.
 * The intents themselves live in modules/igris-device (Kotlin) — see there for why
 * not Linking.sendIntent.
 */
export async function performDeviceAction(
  action: Extract<DeviceAction, { kind: 'alarm.set' | 'alarm.list' }>
): Promise<string> {
  if (Platform.OS !== 'android') throw new Error('Only the Android app can do this.');
  if (!IgrisDevice) throw new Error('This build has no device module. Rebuild the app.');

  switch (action.kind) {
    case 'alarm.set':
      IgrisDevice.setAlarm(action.hour, action.minute, action.label);
      return 'Set in Clock';
    case 'alarm.list':
      IgrisDevice.showAlarms();
      return 'Clock opened';
  }
}

// ── Calls ────────────────────────────────────────────────────────────────────

/**
 * What people call their parents is rarely what the contact is saved as. STT hears
 * "call mom"; the phone has "Mummy". A short list, searched together — anything
 * cleverer (fuzzy matching over the whole address book) risks ringing the wrong person.
 */
export const ALIASES: string[][] = [
  ['mom', 'mummy', 'mumma', 'maa', 'mother', 'mom ji', 'mummy ji'],
  ['dad', 'papa', 'pappa', 'father', 'papa ji', 'daddy'],
  ['bhaiya', 'bhai', 'brother'],
  ['didi', 'sister', 'sis'],
  ['wife', 'wifey'],
];

export const lastDigits = (n: string) => n.replace(/\D/g, '').slice(-10);

/**
 * A contact name as it is SAID: lowercase, emoji and hearts stripped. People save
 * "Bhai😘😈🥰😇" and "Shree😇❤️" — with the emoji glued to the word, "bhai" never
 * equals the name's first word, and a favourite silently stops matching.
 * Surrogate-pair ranges without the `u` flag, not \p{Extended_Pictographic}: they
 * work on every engine, so Hermes support for Unicode regex never matters here.
 */
export const withoutEmoji = (text: string) =>
  text
    .replace(/\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDEFF]|[\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const spokenName = (name: string) => withoutEmoji(name).toLowerCase();

/** Exact name first, then name-starts-with, then word-starts-with; favourites win ties. */
function rank(queries: string[], found: Contact[]): Contact[] {
  const score = (c: Contact) => {
    const name = spokenName(c.name);
    const best = Math.min(
      ...queries.map((q) =>
        name === q ? 0 : name.startsWith(q) ? 1 : name.split(/\s+/).some((w) => w.startsWith(q)) ? 2 : 3
      )
    );
    return best * 4 - (c.starred ? 2 : 0) - (c.primary ? 1 : 0);
  };
  // The same number often appears twice (a SIM copy and a Google copy of one contact).
  const seen = new Set<string>();
  return [...found]
    .sort((a, b) => score(a) - score(b))
    .filter((c) => {
      const key = `${c.name.toLowerCase()}|${lastDigits(c.number)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

async function ensure(permission: (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS]) {
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

/** Who "call <name>" could mean, best first. Throws with a readable reason. */
export async function findCallee(action: Extract<DeviceAction, { kind: 'call' }>): Promise<Contact[]> {
  if (Platform.OS !== 'android') throw new Error('Only the Android app can do this.');
  if (!IgrisDevice) throw new Error('This build has no device module. Rebuild the app.');

  if (action.number) {
    return [{ name: action.number, number: action.number, label: 'Number', starred: false, primary: false }];
  }
  if (!(await ensure(PermissionsAndroid.PERMISSIONS.READ_CONTACTS))) {
    throw new Error('Contacts permission denied — allow it in Settings › Apps › Igris.');
  }

  const name = (action.name ?? '').toLowerCase();
  const queries = ALIASES.find((group) => group.includes(name)) ?? [name];
  let found = (await Promise.all(queries.map((q) => IgrisDevice!.findContacts(q)))).flat();
  // STT often gets a first name right and mangles a surname: retry on the first word.
  const first = name.split(/\s+/)[0];
  if (found.length === 0 && first !== name && first.length >= 3) {
    found = await IgrisDevice.findContacts(first);
  }
  if (found.length === 0) throw new Error(`No contact matches "${action.name}".`);
  return rank(queries, found);
}

/**
 * Ring them. Called only from the confirm card (or a spoken "yes" to it). Without
 * CALL_PHONE it degrades to the dialer with the number filled in — one more tap,
 * never a dead end.
 */
export async function callContact(contact: Contact): Promise<string> {
  if (!IgrisDevice) throw new Error('This build has no device module. Rebuild the app.');
  if (await ensure(PermissionsAndroid.PERMISSIONS.CALL_PHONE)) {
    IgrisDevice.placeCall(contact.number);
    return `Calling ${contact.name}`;
  }
  IgrisDevice.dial(contact.number);
  return 'Opened the dialer — no call permission';
}

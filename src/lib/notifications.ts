import { Platform } from 'react-native';

import IgrisDevice, { type NativeNotification } from '../../modules/igris-device';
import { ALIASES, spokenName, withoutEmoji, type Conversation } from '@/lib/device';
import { matchFavourite } from '@/lib/favourites';

/**
 * Reading and answering notifications — entirely on the phone.
 *
 * maestro only learns that the user asked ("read my messages"); what the messages say
 * is read here, spoken by the on-device TTS, and shown on the card. Nothing below is
 * sent to maestro or saved: the turn holds it in memory until the app closes.
 *
 * Only chat apps are read. Everything else in the shade (OTPs, bank alerts, the
 * delivery app) stays unread — an allowlist, because "read my notifications" aloud in
 * a dhaba should not announce a bank balance.
 */
const APPS: Record<string, string> = {
  'com.whatsapp': 'WhatsApp',
  'com.whatsapp.w4b': 'WhatsApp Business',
  'org.telegram.messenger': 'Telegram',
  'com.google.android.apps.messaging': 'Messages',
  'com.android.mms': 'Messages',
  'com.oneplus.mms': 'Messages',
};

/** Conversations read aloud at most — the rest are counted, not read. */
const MAX_READ = 5;

function available() {
  if (Platform.OS !== 'android') throw new Error('Only the Android app can do this.');
  if (!IgrisDevice) throw new Error('This build has no device module. Rebuild the app.');
  return IgrisDevice;
}

/**
 * There is no permission prompt for notification access — it is a switch in
 * Settings. Opening that page is the most the app can do, so the first request
 * opens it and fails with instructions; the next one works.
 */
async function shade(): Promise<NativeNotification[]> {
  const device = available();
  if (!device.hasNotificationAccess()) {
    device.openNotificationAccess();
    throw new Error('Turn on Igris under Notification access, then ask again.');
  }
  return device.getNotifications();
}

function conversation(n: NativeNotification): Conversation | null {
  const app = APPS[n.packageName];
  // ongoing: WhatsApp's "checking for new messages", a backup in progress.
  if (!app || n.ongoing) return null;
  const lines = n.messages.length
    ? n.messages
    : n.text
      ? [{ sender: null, text: n.text }]
      : [];
  if (lines.length === 0) return null;
  return {
    key: n.key,
    app,
    title: withoutEmoji(n.title ?? app) || app,
    lines: lines.map((l) => ({ sender: l.sender && withoutEmoji(l.sender), text: withoutEmoji(l.text) })),
    postedAt: n.postedAt,
    canReply: n.canReply,
  };
}

/**
 * Names this person could appear under. The chat title is the saved contact name
 * ("Mummy"), so "mom" needs the same alias groups a call uses — plus a quick-call
 * favourite's own alias, where a personal nickname lives.
 */
async function namesFor(who: string): Promise<string[]> {
  const q = spokenName(who);
  const names = ALIASES.find((group) => group.includes(q)) ?? [q];
  const favourite = await matchFavourite(who, null);
  return favourite ? [...names, spokenName(favourite.name)] : names;
}

function mentions(c: Conversation, names: string[]) {
  const said = [c.title, ...c.lines.map((l) => l.sender ?? '')].map(spokenName);
  return said.some((s) =>
    names.some((q) => s === q || s.startsWith(q) || s.split(/[\s:]+/).some((w) => w && w.startsWith(q)))
  );
}

/** Chats in the shade, newest first — only those from `from` when given. */
export async function readMessages(from: string | null): Promise<Conversation[]> {
  const all = (await shade())
    .map(conversation)
    .filter((c): c is Conversation => c !== null)
    .sort((a, b) => b.postedAt - a.postedAt);
  if (!from) return all;
  const names = await namesFor(from);
  return all.filter((c) => mentions(c, names));
}

/** What the phone says instead of maestro's "checking your messages". */
export function speakable(convs: Conversation[], from: string | null): string {
  if (convs.length === 0) return from ? `Nothing from ${from}, my liege.` : 'No new messages, my liege.';
  const read = convs.slice(0, MAX_READ).map((c) => {
    const said = c.lines
      .slice(-3)
      .map((l) => (l.sender && spokenName(l.sender) !== spokenName(c.title) ? `${l.sender}: ${l.text}` : l.text))
      .join('. ');
    return `${c.title}, on ${c.app}. ${said}`;
  });
  const more = convs.length - read.length;
  // One chat per line: the speaker picks a voice per line (voice/language.ts), so a
  // Hinglish chat is read whole in the Hindi voice, header included.
  const head = convs.length === 1 ? [] : [`${convs.length} chats.`];
  return [...head, ...read.map((r) => `${r}.`), ...(more > 0 ? [`And ${more} more.`] : [])].join('\n');
}

/**
 * Who a reply could go to. Several matches → the card asks which; `to` null means
 * the newest chat that can be answered, which is what "reply to him" meant.
 */
export async function replyTargets(to: string | null): Promise<Conversation[]> {
  const found = (await readMessages(to)).filter((c) => c.canReply);
  if (found.length === 0) {
    throw new Error(to ? `No message from ${to} to reply to.` : 'No message to reply to.');
  }
  return to ? found.slice(0, 3) : found.slice(0, 1);
}

/** Sends through the notification's own reply box. Only after the user confirmed. */
export async function sendReply(target: Conversation, text: string): Promise<string> {
  await available().reply(target.key, text);
  return `Sent on ${target.app}`;
}

const SNOOZE = /snooze/i;
const DISMISS = /dismiss|stop|close|turn off|^off$|^[x✕×]$/i;

/**
 * A ringing alarm, told apart from an "upcoming alarm" notice: it takes the full
 * screen AND offers Snooze. Pressing the upcoming notice's Dismiss would skip the
 * next alarm — the opposite of what "stop the alarm" means.
 */
export async function stopAlarm(snooze: boolean): Promise<string> {
  const ringing = (await shade()).find(
    (n) =>
      (n.fullScreen || n.category === 'alarm') &&
      n.actions.some((a) => SNOOZE.test(a)) &&
      !APPS[n.packageName]
  );
  if (!ringing) throw new Error('No alarm is ringing.');
  // ColorOS labels Dismiss with a bare ✕; failing a known word, the non-Snooze button.
  const named = ringing.actions.findIndex((a) => !SNOOZE.test(a) && DISMISS.test(a.trim()));
  const index = snooze
    ? ringing.actions.findIndex((a) => SNOOZE.test(a))
    : named >= 0
      ? named
      : ringing.actions.findIndex((a) => !SNOOZE.test(a));
  if (index < 0) throw new Error('This alarm has no button to press.');
  await available().pressAction(ringing.key, index);
  return snooze ? 'Snoozed' : 'Silenced';
}

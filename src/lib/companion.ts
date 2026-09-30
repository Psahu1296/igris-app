import { fetch as streamFetch } from 'expo/fetch';
import { useEffect, useState } from 'react';

import { urlFor, type Lane } from '@/lib/config';
import { authedFetch } from '@/lib/maestro';
import { createSseParser } from '@/lib/sse';
import * as secure from '@/lib/secure';

/**
 * The owner's private companion chat (maestro companion/, api/companion.py). A separate
 * persona on the Mac's local model, not Igris: no tools, no Igris memory, not in Chats.
 * Her name and history come from maestro; nothing about her is in this app. maestro
 * answers 404 to anyone but the owner, and the menu row only appears once it answered 200.
 */

/** A photo she sent (maestro companion/photos.py), drawn on the Mac from her base face. */
export type CompanionPhoto = {
  name: string;
  model: string;
  scene: string;
  /** A photo he sent her, not one of hers. */
  his?: boolean;
  /** His photo while it is still only on the phone (the turn is running). */
  uri?: string;
  /** A photo of hers he can open a single time (her `[private: …]` tag); see `seen`. */
  once?: boolean;
};

export type CompanionMessage = {
  role: 'you' | 'her';
  text: string;
  /** When it was saved on the Mac; also its id (likeMessage). */
  at: string;
  image?: CompanionPhoto;
  /** She wrote first, after a long silence (maestro companion/reach.py). */
  reach?: boolean;
};

/** A scene or a game he can start with one tap (maestro companion/scenes.py). */
export type CompanionScene = { id: string; title: string; kind: 'scene' | 'game' };

/** Tonight's dial (maestro companion/dial.py): how he wants a scene to go, and who leads. */
export type CompanionDial = { pace: number; lead: 'her' | 'him' | 'switch' };
export const PACES = ['Tender', 'Slow burn', 'Playful', 'Intense', 'Wild'];
export const LEADS: { id: CompanionDial['lead']; title: string }[] = [
  { id: 'her', title: 'She leads' },
  { id: 'him', title: 'You lead' },
  { id: 'switch', title: 'Take turns' },
];

/** She is busy and will answer at `until` (maestro companion/presence.py). */
export type CompanionAway = { until: string; reason: string };

export type CompanionOutfit = { id: string; title: string };

export type DiaryEntry = { date: string; text: string };

/** One thing she has written down about the two of them (maestro companion/memory.py). */
export type CompanionMemory = { at: string; kind: 'fact' | 'episode' | 'reflection'; text: string; weight: number };

/**
 * A turn still running on the Mac (api/companion.py `_pending`). The Mac finishes a turn
 * whether or not the phone is listening, so a phone whose stream died reads it from here.
 */
export type CompanionPending = {
  message: string;
  at: string;
  /** His message is in `messages` already; false while she is still typing. */
  saved: boolean;
  /** Her words so far, then her reply as it will be saved. */
  text: string;
  /** mflux's steps once a photo is being taken. */
  photo: { done: number; total: number } | null;
};

/**
 * The Mac itself said no (an `error` frame, a 4xx): the turn did not happen. Any other
 * failure of the stream means only the stream was lost, and the turn may be running.
 */
export class CompanionRefused extends Error {}

export type Companion = {
  name: string;
  age: number;
  model: string;
  /** The picture every photo of her is drawn from, or null before her first photo. */
  face: string | null;
  messages: CompanionMessage[];
  /** Missing on a maestro from before 2026-09-30. */
  pending?: CompanionPending | null;
  /** How she is right now (maestro companion/inner.py). Missing on an older maestro, like the two below. */
  state?: { stage: string; mood: string; where: string };
  /** The `at` of each message of hers he put a heart on. */
  liked?: string[];
  scenes?: CompanionScene[];
  away?: CompanionAway | null;
  dial?: CompanionDial | null;
  outfits?: CompanionOutfit[];
  /** Names of the open-once photos he has opened. */
  seen?: string[];
};

/**
 * The header's second line when she is idle: that she is busy and when she is back, else
 * her mood and where she is, once she has said.
 */
export const moodLine = (c: Pick<Companion, 'state' | 'away'>): string | null => {
  if (c.away) return `${c.away.reason} · back around ${clock(c.away.until)}`;
  const parts = [c.state?.mood, c.state?.where].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
};

const clock = (iso: string) => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? 'soon' : `${at.getHours() % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')}`;
};

/**
 * One message of hers as the texts she sent: she puts separate thoughts on separate lines
 * (her prompt asks her to), and each is its own bubble, the way a few quick texts arrive.
 */
export const bubbles = (text: string): string[] => {
  const parts = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : [text];
};

/**
 * What the chat shows for a snapshot from the Mac: the saved messages, plus the turn in
 * flight. While she types, his message is not saved yet, so it is added here; her words
 * become a real message the moment they are finalized (`pending.saved`), whether or not a
 * photo is still to come — not the moment the photo starts, which can now be many seconds
 * later (artist.py writes the photo's prompt first). Getting this wrong showed her already-
 * finished reply as a live preview a while longer, then swapped it for the "real" one the
 * instant the photo began: read as a second, different reply (seen live 2026-09-30).
 */
export function shown(c: Companion): {
  messages: CompanionMessage[];
  /** Her words so far while she types, else null. */
  live: string | null;
  snapping: { done: number; total: number } | null;
} {
  const p = c.pending;
  if (!p) return { messages: c.messages, live: null, snapping: null };
  // A photo of his with no words has nothing to show until the Mac has saved it.
  const messages = p.saved || !p.message ? [...c.messages] : [...c.messages, { role: 'you' as const, text: p.message, at: p.at }];
  if (!p.saved) return { messages, live: p.text, snapping: null };            // still typing
  if (p.text) messages.push({ role: 'her', text: p.text, at: `${p.at}+her` }); // her words are final
  return { messages, live: null, snapping: p.photo };                        // a photo may still be coming
}

/**
 * A message cut into what is said and what is done: feelings and body language go between
 * asterisks ("*sharma ke*", maestro companion/persona.py), hers and his alike, and the
 * chat shows those in italics without the asterisks. An unclosed "*" (half a message, while
 * it streams) stays as written.
 */
export function emotes(text: string): { text: string; action: boolean; sound?: boolean }[] {
  const out: { text: string; action: boolean; sound?: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(/\*([^*\n]{1,120})\*/g)) {
    if (m.index > at) out.push(...voiced(text.slice(at, m.index)));
    out.push({ text: m[1].trim(), action: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push(...voiced(text.slice(at)));
  return out;
}

// A sound she makes, spelled out (maestro companion/express.py `_SOUND`, kept the same):
// an interjection with its letters held, or any word with one letter three times over.
const SOUND =
  /\b(?:a+h{2,}|a{2,}h+|o+h{2,}|o{2,}h+|m{3,}h*|m{2,}h+|u+f{2,}|h+a{2,}h*|u+n+g?h{2,}|hu+h{2,}|s{3,}|hm{2,}|e{3,}|(?:ha){2,}h?|(?:he){2,}h?|\w*(\w)\1{2,}\w*)\b[.!?~-]*/gi;

/** The sounds in `text`, in order (with repeats): what she is heard making. */
export const sounds = (text: string): string[] => text.match(SOUND) ?? [];

/** Spoken words cut into plain runs and the sounds between them, so a sound can look like one. */
function voiced(text: string): { text: string; action: boolean; sound?: boolean }[] {
  const out: { text: string; action: boolean; sound?: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(SOUND)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), action: false });
    out.push({ text: m[0], action: false, sound: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), action: false });
  return out;
}

/**
 * His side of the same thing: chips that put an action into the message he is writing, so
 * she reads what he does and feels, not only what he says (her prompt tells her how).
 */
export const MY_EMOTES = [
  'smiles', 'laughs', 'blushes', 'hugs you', 'kisses you', 'holds your hand', 'pulls you close',
  'teasing', 'missing you', 'jealous', 'pouts', 'tired', 'sad', 'excited',
];

/** `draft` with the action added at its end, ready for more words. */
export const withEmote = (draft: string, emote: string) => `${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}*${emote}* `;

/** Her photos are portrait, like a phone's (photos.SIZE, 768 × 960). */
export const PHOTO_ASPECT = 768 / 960;

// The last snapshot the Mac gave, kept while the app is open: the screen opens on it at
// once and refreshes behind it, where it used to show a loader on every visit. Memory
// only, on purpose: her chat is never written to the phone's storage.
let lastSeen: { lane: Lane; companion: Companion } | null = null;

export const lastCompanion = (lane: Lane): Companion | null => (lastSeen?.lane === lane ? lastSeen.companion : null);

export async function fetchCompanion(lane: Lane): Promise<Companion> {
  const res = await authedFetch(lane, '/companion');
  if (!res.ok) throw new Error(res.status === 404 ? 'Not here.' : `The Mac refused (${res.status}).`);
  const companion = (await res.json()) as Companion;
  lastSeen = { lane, companion };
  return companion;
}

/**
 * Live mode: a photo with every reply, so he sees her as she talks (maestro takes them
 * smaller, since there is one per message). Off by default and again after every app
 * start: each reply then waits on a photo.
 */
let liveOn = false;
export const liveMode = { get: () => liveOn, set: (on: boolean) => void (liveOn = on) };

/** Make one of her photos the base face all later photos are drawn from. */
export async function setFace(lane: Lane, name: string): Promise<void> {
  const res = await authedFetch(lane, '/companion/face', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`The Mac refused (${res.status}).`);
}

export async function forgetCompanion(lane: Lane): Promise<void> {
  const res = await authedFetch(lane, '/companion', { method: 'DELETE' });
  if (!res.ok) throw new Error(`The Mac refused (${res.status}).`);
}

const post = (lane: Lane, path: string, body: unknown) =>
  authedFetch(lane, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Put a heart on a message of hers, or take it off. She is shown the lines he loved. */
export async function likeMessage(lane: Lane, at: string, on: boolean): Promise<string[]> {
  const res = await post(lane, '/companion/like', { at, on });
  if (!res.ok) throw new Error(res.status === 404 ? 'That message is not saved on the Mac yet.' : `The Mac refused (${res.status}).`);
  return ((await res.json()) as { liked: string[] }).liked;
}

export async function setDial(lane: Lane, dial: CompanionDial): Promise<void> {
  const res = await authedFetch(lane, '/companion/dial', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dial),
  });
  if (!res.ok) throw new Error(res.status === 404 ? "This Mac's maestro is too old for the dial." : `The Mac refused (${res.status}).`);
}

/** He opened a photo that opens once: the Mac remembers, so it stays shut on every later visit. */
export async function markSeen(lane: Lane, name: string): Promise<void> {
  const res = await post(lane, '/companion/seen', { name });
  if (!res.ok) throw new Error(`The Mac refused (${res.status}).`);
}

/** Her diary, newest first. */
export async function fetchDiary(lane: Lane): Promise<DiaryEntry[]> {
  const res = await authedFetch(lane, '/companion/diary');
  if (!res.ok) throw new Error(res.status === 404 ? "This Mac's maestro is too old for her diary." : `The Mac refused (${res.status}).`);
  return ((await res.json()) as { entries: DiaryEntry[] }).entries;
}

/** What she remembers, newest first. */
export async function fetchMemory(lane: Lane): Promise<CompanionMemory[]> {
  const res = await authedFetch(lane, '/companion/memory');
  if (!res.ok) throw new Error(res.status === 404 ? "This Mac's maestro is too old for her memory." : `The Mac refused (${res.status}).`);
  return ((await res.json()) as { items: CompanionMemory[] }).items;
}

export async function forgetMemory(lane: Lane, item: CompanionMemory): Promise<void> {
  const res = await post(lane, '/companion/memory/forget', { at: item.at, text: item.text });
  if (!res.ok && res.status !== 404) throw new Error(`The Mac refused (${res.status}).`);
}

/** Her name while `active` on the Mac, or null: not the owner, Render, or an old maestro. */
export function useCompanionName(lane: Lane, active: boolean): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!active || lane !== 'local') return;
    let live = true;
    fetchCompanion(lane)
      .then((c) => live && setName(c.name))
      .catch(() => live && setName(null));
    return () => {
      live = false;
    };
  }, [lane, active]);
  return lane === 'local' ? name : null;
}

export type CompanionEvent =
  | { kind: 'typing' }
  /** Her words so far, as the model writes them. */
  | { kind: 'token'; text: string }
  /** The reply as saved. Can differ from the tokens: maestro replaces a reply that breaks its age rule. */
  | { kind: 'reply'; text: string }
  /** She is writing the reply again (it repeated her own lines): the words so far are void. */
  | { kind: 'retake' }
  /** She is busy: his message is saved and she answers later (`until`). No reply follows. */
  | { kind: 'away'; away: CompanionAway }
  /** After her words: a photo is being taken, its mflux steps, the photo, or why not. */
  | { kind: 'photoStarted' }
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'photo'; photo: CompanionPhoto }
  | { kind: 'photoFailed'; message: string };

/**
 * Her words as they stream, without the `[photo: …]` tag she ends a message with — the
 * tag is for maestro, and half of one ("[pho") shows up before it can be matched whole.
 */
export const withoutTag = (text: string) =>
  text
    // A tag still being written: "[", "[pho", "[private: on the", not yet closed.
    .replace(/\s*\[[a-z]{0,8}(?::[^\]]*)?$/i, '')
    .replace(/\s*\[(?:photo|selfie|pic|image|private|set)\s*:[^\]]*\]\s*/gi, ' ')
    // Her hidden line (maestro companion/inner.py) is stripped on the Mac before this
    // ever streams; this is a second net for the one seen live (2026-09-30), where she
    // echoed the same tag again mid-reply.
    .replace(/\s*\[(?:inner|feel|state)\s*:[^\]]*\]\s*/gi, ' ')
    .trimEnd();

/**
 * Send one message and stream her reply (with `image`, a photo of his she can see); or,
 * with neither, the camera button: she sends a photo of the moment the chat is in, with a
 * line of her own, and nothing of his is saved (maestro POST /companion/snap); or, with
 * `scene`, a scene card or a game, which she opens (POST /companion/scene). The same
 * bearer-token dance as streamChat: one re-login on a 401, since signing in elsewhere
 * evicts the phone's token.
 *
 * Throws CompanionRefused when the Mac refused the turn. Any other error (the socket died
 * with the screen off, the stream ended early, a 409 because a turn is already running)
 * leaves the turn to the Mac: read `pending` from fetchCompanion to pick it up.
 */
export async function streamCompanion(opts: {
  lane: Lane;
  message?: string;
  /** A photo of his, base64, sent with (or instead of) `message`. */
  image?: string;
  /** A scene card's id; `message` and `image` are then ignored. */
  scene?: string;
  /** An outfit's id: she puts it on and shows him. Ignores the rest, like `scene`. */
  outfit?: string;
  /** Live mode: she sends a photo with this reply. Ignored by the camera button and scenes. */
  live?: boolean;
  onEvent: (event: CompanionEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { lane, message, image, scene, outfit, live = false, onEvent, signal } = opts;
  // A card (a scene or an outfit) is sent by its id; the camera button sends nothing at all.
  const card = scene !== undefined ? { path: 'scene', id: scene } : outfit !== undefined ? { path: 'outfit', id: outfit } : null;
  const snap = !card && message === undefined && image === undefined;
  const run = (token: string) =>
    streamFetch(`${urlFor(lane)}/companion/${card ? card.path : snap ? 'snap' : 'stream'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
      body: card ? JSON.stringify({ id: card.id }) : snap ? undefined : JSON.stringify({ message: message ?? '', image, live }),
      signal,
    });

  let token = await secure.loadToken(lane);
  let res = token ? await run(token) : null;
  if (!res || res.status === 401) {
    // authedFetch re-logs in on a 401; a cheap GET lets it refresh the token first.
    await fetchCompanion(lane);
    token = await secure.loadToken(lane);
    if (!token) throw new CompanionRefused('Not signed in.');
    res = await run(token);
  }
  if (res.status === 404)
    throw new CompanionRefused(card ? "This Mac's maestro is too old for that." : snap ? "This Mac's maestro is too old for the camera button." : "This Mac's maestro has no companion.");
  if (res.status === 409) throw new Error('She is still answering.');
  if (res.status === 400 || res.status === 422)
    throw new CompanionRefused(image ? 'The Mac could not read that photo (an older maestro cannot take photos at all).' : 'The Mac refused that message.');
  if (!res.ok) throw new CompanionRefused(`The Mac returned ${res.status}.`);
  if (!res.body) throw new Error('The Mac sent no response body.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parse = createSseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const frame of parse(decoder.decode(value, { stream: true }))) {
      if (frame.event === 'done') return;
      let data: { message?: string; text?: string; done?: number; total?: number; name?: string; model?: string; scene?: string; once?: boolean; until?: string };
      try {
        data = JSON.parse(frame.data);
      } catch {
        continue; // a malformed frame is not worth losing the reply over
      }
      if (frame.event === 'status') onEvent({ kind: 'typing' });
      else if (frame.event === 'token' && data.text) onEvent({ kind: 'token', text: data.text });
      else if (frame.event === 'response' && data.message) onEvent({ kind: 'reply', text: data.message });
      else if (frame.event === 'retake') onEvent({ kind: 'retake' });
      else if (frame.event === 'away' && data.until)
        onEvent({ kind: 'away', away: { until: data.until, reason: (data.message ?? '').replace(/^\S+ is /, '') || 'busy' } });
      else if (frame.event === 'photo_status') onEvent({ kind: 'photoStarted' });
      else if (frame.event === 'progress' && typeof data.done === 'number' && typeof data.total === 'number')
        onEvent({ kind: 'progress', done: data.done, total: data.total });
      else if (frame.event === 'image' && data.name)
        onEvent({ kind: 'photo', photo: { name: data.name, model: data.model ?? '', scene: data.scene ?? '', once: data.once } });
      else if (frame.event === 'photo_error') onEvent({ kind: 'photoFailed', message: data.message ?? 'The photo failed.' });
      else if (frame.event === 'error') throw new CompanionRefused(data.message ?? 'Something went wrong on the Mac.');
    }
  }
  throw new Error('The stream ended before she finished.');
}

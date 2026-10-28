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
/** Which eyes a photo of hers is seen from again: his, or hers. */
export type PhotoView = { name: string; view: 'his' | 'hers' };

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
  /** How long it took her to get this photo to him: writing its prompt (artist.py) plus
   * mflux drawing it. Missing on a maestro from before 2026-10-01. */
  seconds?: number;
  /** The drawing's seed: drawn again with it, the same photo comes back (the director's "change one thing"). */
  seed?: number;
  /** What the Mac's own check found wrong in it (fault ids, see Director.faults). */
  faults?: string[];
  /** His choices, when he directed it (directPhoto). */
  direction?: Direction;
};

export type CompanionMessage = {
  role: 'you' | 'her';
  text: string;
  /** When it was saved on the Mac; also its id (likeMessage). */
  at: string;
  image?: CompanionPhoto;
  /** She wrote first, after a long silence (maestro companion/reach.py). */
  reach?: boolean;
  /** How long her reply itself took, retakes included — not the photo, which has its own
   * `image.seconds`. Missing on a text she sent with no words (a set's later photos) or a
   * maestro from before 2026-10-01. */
  took?: number;
  /** His message she read and did not answer, sulking (maestro companion/tone.py). */
  left_on_seen?: boolean;
  /** His reply to one of her stories (maestro companion/stories.py). */
  story?: { id: string; name: string; caption: string };
  /** Buttons under her message (maestro companion/choices.py): a game's answers (text he sends back)
   * or, after a first move of hers (firstmove.py), touches he answers with. */
  choices?: (string | { label: string; touch: string })[];
  /** Her good morning / good night (maestro companion/rituals.py). */
  ritual?: 'morning' | 'night';
};

/** Her tone as weather beside her name (maestro companion/tone.py TONES). */
export const TONE_WEATHER: Record<string, string> = {
  neutral: '⛅',
  flirty: '💗',
  intimate: '🔥',
  afterglow: '🌙',
  happy: '☀️',
  low: '🌧️',
  sulking: '⚡',
};

/** One of her stories: a photo of her own day, kept 24 hours on the Mac (maestro companion/stories.py). */
export type CompanionStory = { id: string; at: string; caption: string; seen: boolean; image: { name: string; model: string } };

/**
 * Her chat's colour by her tone (maestro companion/tone.py `TONES`): rose by default, deep red
 * when intimate, a cold blue while she sulks. Anything unknown falls back to rose.
 */
export const TONE_COLORS: Record<string, string> = {
  neutral: '#FB7185',
  flirty: '#F472B6',
  intimate: '#E11D48',
  afterglow: '#FB923C',
  happy: '#FBBF24',
  low: '#94A3B8',
  sulking: '#60A5FA',
};
export const toneColor = (tone?: string) => TONE_COLORS[tone ?? 'neutral'] ?? TONE_COLORS.neutral;

/** A scene or a game he can start with one tap (maestro companion/scenes.py). */
export type CompanionScene = { id: string; title: string; kind: 'scene' | 'game' | 'roleplay' };

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

/** A gift he can give her now (maestro companion/gifts.py); `line` is his action as the Mac saves it. */
export type CompanionGift = { id: string; label: string; icon: string; line: string };

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
  /** His message is in `messages` already. True from the start on a turn with nothing of
   * his to save (a double-text, a reach-out) — `done` is what says whether her words are
   * finished, not this. Missing on a maestro from before 2026-10-01: treat as `done`. */
  saved: boolean;
  /** Her words are final — not while she is still typing, even on a turn where `saved`
   * was already true. Missing on a maestro from before 2026-10-01: treat as `saved`. */
  done?: boolean;
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

/**
 * A way he can touch her right now (maestro companion/touch.py): the floating button. The Mac
 * decides which fit the moment; `lines` is his action for one tap, a few, and a burst.
 */
/** A position on the position button's wheel (maestro poses.POSITIONS); `said` is his move as shown. */
export type CompanionPosition = { id: string; title: string; about: string; said: string };

export type CompanionTouch = { id: string; label: string; icon: string; lines: [string, string, string] | [string, string, string, string] };

/** His action for a burst of taps, the same thresholds as touch.line on the Mac. */
export const touchLine = (touch: CompanionTouch, taps: number) =>
  // maestro touch.grade: 1, 2-3, 4+ — or with a fourth line (push during sex): 1, 2-3, 4-5, 6+.
  taps <= 1 ? touch.lines[0] : taps <= 3 ? touch.lines[1] : taps <= 5 ? touch.lines[2] : (touch.lines[3] ?? touch.lines[2]);

/** One of the companions on the Mac (maestro companion/profiles.py), for the picker. */
export type CompanionListing = { id: string; name: string; age: number; face: string | null; busy: boolean };

/**
 * Which companion every call here is about: maestro takes `?who=` on each route, its own
 * default when absent ('' here). Kept for the app's run, like liveMode; the screen
 * remounts on a switch.
 */
let whoNow = '';
export const companionWho = { get: () => whoNow, set: (who: string) => void (whoNow = who) };
const whoPath = (path: string) => (whoNow ? `${path}?who=${encodeURIComponent(whoNow)}` : path);

export type Companion = {
  /** Her id in `companions`. Missing on a maestro from before 2026-10-03. */
  id?: string;
  name: string;
  age: number;
  model: string;
  /** The picture every photo of her is drawn from, or null before her first photo. */
  face: string | null;
  messages: CompanionMessage[];
  /** Missing on a maestro from before 2026-09-30. */
  pending?: CompanionPending | null;
  /** How she is right now (maestro companion/inner.py). Missing on an older maestro, like the two below. */
  state?: { stage: string; mood: string; where: string; tone?: string };
  /** The `at` of each message of hers he put a heart on. */
  liked?: string[];
  scenes?: CompanionScene[];
  away?: CompanionAway | null;
  dial?: CompanionDial | null;
  outfits?: CompanionOutfit[];
  /** Names of the open-once photos he has opened. */
  seen?: string[];
  /** Every companion on the Mac. Missing on a maestro from before 2026-10-03 (one companion only). */
  companions?: CompanionListing[];
  /** Her photos still on their way (maestro companion/darkroom.py); null when none. Missing on an older maestro. */
  photos?: CompanionPhotosComing | null;
  /** The touches that fit this moment, first = the button's face. Missing on a maestro from before 2026-10-27. */
  touches?: CompanionTouch[];
  /** The position wheel, only in an intimate moment ([] otherwise), and the one they are in. */
  positions?: CompanionPosition[];
  position?: string | null;
  /** Where he can touch her from her photo, for the moment (maestro touch.SPOTS). */
  touch_spots?: CompanionTouch[];
  /** Gifts he can give her now. Missing on a maestro from before 2026-10-27. */
  gifts?: CompanionGift[];
  /** Her stories of the last day: a ring on her avatar while some are unseen. */
  stories?: { count: number; unseen: number };
  /** Mornings they both kept in a row (maestro companion/rituals.py). */
  streak?: { days: number; today: boolean };
};

/** Photos queued on the Mac: drawn one by one while the chat goes on. */
export type CompanionPhotosComing = {
  /** How many wait behind the one being made. */
  queued: number;
  /** The one being made now: its place in what was asked for, and the draw's steps. */
  drawing: { index: number; of: number; done: number; total: number } | null;
};

/** The line the chat shows while photos are on their way. */
export const comingLine = (p: CompanionPhotosComing): string => {
  const d = p.drawing;
  if (!d) return p.queued === 1 ? 'A photo is on its way…' : `${p.queued} photos on their way…`;
  const which = d.of > 1 ? `Photo ${d.index} of ${d.of}` : 'Taking a photo';
  return d.total ? `${which} · ${d.done} of ${d.total}` : `${which} · getting it ready…`;
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
  // `saved` alone is not enough: on an unasked turn (a double-text, a reach-out) it is
  // true from the very start, since there is nothing of his to save, while she is still
  // writing — `done` (older maestro: fall back to `saved`) is the one that means her
  // words are final. Getting this wrong showed her half-written reply as the finished
  // one (seen live 2026-10-01).
  if (!(p.done ?? p.saved)) return { messages, live: p.text, snapping: null }; // still typing
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

/** Her colour. Only her screens use it: it is her room, not an Igris state. */
export const ROSE = '#FB7185';
export const ROSE_SOFT = 'rgba(251, 113, 133, 0.14)';

// The last snapshot the Mac gave, kept while the app is open: the screen opens on it at
// once and refreshes behind it, where it used to show a loader on every visit. Memory
// only, on purpose: her chat is never written to the phone's storage.
let lastSeen: { lane: Lane; who: string; companion: Companion } | null = null;

export const lastCompanion = (lane: Lane): Companion | null =>
  lastSeen?.lane === lane && lastSeen.who === whoNow ? lastSeen.companion : null;

export async function fetchCompanion(lane: Lane): Promise<Companion> {
  const res = await authedFetch(lane, whoPath('/companion'));
  if (!res.ok) throw new Error(res.status === 404 ? 'Not here.' : `The Mac refused (${res.status}).`);
  const companion = (await res.json()) as Companion;
  lastSeen = { lane, who: whoNow, companion };
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
  const res = await authedFetch(lane, whoPath('/companion/face'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`The Mac refused (${res.status}).`);
}

/**
 * `who` is fixed when the confirm dialog opens: read at tap time it was whoever the screen
 * had switched to by then, and a "Clear" dialog for one companion wiped the other (2026-10-25).
 */
export async function forgetCompanion(lane: Lane, who: string): Promise<void> {
  const path = who ? `/companion?who=${encodeURIComponent(who)}` : '/companion';
  const res = await authedFetch(lane, path, { method: 'DELETE' });
  if (!res.ok) throw new Error(`The Mac refused (${res.status}).`);
}

const post = (lane: Lane, path: string, body: unknown) =>
  authedFetch(lane, path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Put a heart on a message of hers, or take it off. She is shown the lines he loved. */
export async function likeMessage(lane: Lane, at: string, on: boolean): Promise<string[]> {
  const res = await post(lane, whoPath('/companion/like'), { at, on });
  if (!res.ok) throw new Error(res.status === 404 ? 'That message is not saved on the Mac yet.' : `The Mac refused (${res.status}).`);
  return ((await res.json()) as { liked: string[] }).liked;
}

/** Deletes one message, his or hers, from the Mac. Nothing else of hers moves. */
export async function deleteMessage(lane: Lane, at: string): Promise<void> {
  const res = await post(lane, whoPath('/companion/message/delete'), { at });
  if (!res.ok) throw new Error(res.status === 404 ? 'That message is already gone.' : `The Mac refused (${res.status}).`);
}

export async function setDial(lane: Lane, dial: CompanionDial): Promise<void> {
  const res = await authedFetch(lane, whoPath('/companion/dial'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dial),
  });
  if (!res.ok) throw new Error(res.status === 404 ? "This Mac's maestro is too old for the dial." : `The Mac refused (${res.status}).`);
}

/** He opened a photo that opens once: the Mac remembers, so it stays shut on every later visit. */
export async function markSeen(lane: Lane, name: string): Promise<void> {
  const res = await post(lane, whoPath('/companion/seen'), { name });
  if (!res.ok) throw new Error(`The Mac refused (${res.status}).`);
}

/**
 * Stop her (maestro POST /companion/stop): a reply still being written is cut where it is and
 * kept, and her photos still waiting in line are dropped; a photo already drawing finishes.
 * The running stream then ends by itself with what she had written.
 */
export async function stopCompanion(lane: Lane): Promise<{ stopped: boolean; dropped: number }> {
  const res = await post(lane, whoPath('/companion/stop'), {});
  if (res.status === 404) throw new CompanionRefused("This Mac's maestro is too old to stop her.");
  if (!res.ok) throw new Error(`The Mac refused (${res.status}).`);
  return (await res.json()) as { stopped: boolean; dropped: number };
}

/** Her stories of the last day, oldest first. */
export async function fetchStories(lane: Lane): Promise<CompanionStory[]> {
  const res = await authedFetch(lane, whoPath('/companion/stories'));
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`The Mac refused (${res.status}).`);
  return ((await res.json()) as { stories: CompanionStory[] }).stories;
}

/** He watched one: the ring goes when none are left unseen. Best effort. */
export async function markStorySeen(lane: Lane, id: string): Promise<void> {
  await post(lane, whoPath('/companion/stories/seen'), { id }).catch(() => undefined);
}

/** Her diary, newest first. */
export async function fetchDiary(lane: Lane): Promise<DiaryEntry[]> {
  const res = await authedFetch(lane, whoPath('/companion/diary'));
  if (!res.ok) throw new Error(res.status === 404 ? "This Mac's maestro is too old for her diary." : `The Mac refused (${res.status}).`);
  return ((await res.json()) as { entries: DiaryEntry[] }).entries;
}

/** What she remembers, newest first. */
export async function fetchMemory(lane: Lane): Promise<CompanionMemory[]> {
  const res = await authedFetch(lane, whoPath('/companion/memory'));
  if (!res.ok) throw new Error(res.status === 404 ? "This Mac's maestro is too old for her memory." : `The Mac refused (${res.status}).`);
  return ((await res.json()) as { items: CompanionMemory[] }).items;
}

export async function forgetMemory(lane: Lane, item: CompanionMemory): Promise<void> {
  const res = await post(lane, whoPath('/companion/memory/forget'), { at: item.at, text: item.text });
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
  | { kind: 'reply'; text: string; seconds?: number }
  /** She is writing the reply again (it repeated her own lines): the words so far are void. */
  | { kind: 'retake' }
  /** She is busy: his message is saved and she answers later (`until`). No reply follows. */
  | { kind: 'away'; away: CompanionAway }
  /** She read it and is not answering (sulking, maestro companion/tone.py). No reply follows. */
  | { kind: 'seen' }
  /** After her words: a photo is being taken, its mflux steps, the photo, or why not. */
  | { kind: 'photoStarted' }
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'photo'; photo: CompanionPhoto }  // photo.seconds carries how long it took
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
  /** His message answers this story of hers (its id). */
  story?: string;
  /** A scene card's id; `message` and `image` are then ignored. */
  scene?: string;
  /** An outfit's id: she puts it on and shows him. Ignores the rest, like `scene`. */
  outfit?: string;
  /** He touches her (POST /companion/touch): a touch's id and how many taps in the burst. */
  touch?: { id: string; taps: number };
  /** He gives her a gift (POST /companion/gift): its id. */
  gift?: string;
  /** He moves the two of them into a position (POST /companion/position): its id. */
  position?: string;
  /** Live mode: she sends a photo with this reply. Ignored by the camera button and scenes. */
  live?: boolean;
  /** One of her photos again from his eyes or hers (maestro POST /companion/view): no words,
   * frames like the camera button's. Ignores the rest. */
  view?: PhotoView;
  onEvent: (event: CompanionEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { lane, message, image, scene, outfit, touch, gift, position, story, live = false, view, onEvent, signal } = opts;
  // A card (a scene, an outfit, a touch) is sent by its id; the camera button sends nothing at all.
  const card =
    scene !== undefined
      ? { path: 'scene', id: scene }
      : outfit !== undefined
        ? { path: 'outfit', id: outfit }
        : touch !== undefined
          ? { path: 'touch', id: touch.id, taps: touch.taps }
          : gift !== undefined
            ? { path: 'gift', id: gift }
            : position !== undefined
              ? { path: 'position', id: position }
              : null;
  const snap = !card && !view && message === undefined && image === undefined;
  const path = view ? 'view' : card ? card.path : snap ? 'snap' : 'stream';
  const body = view
    ? JSON.stringify(view)
    : card
      ? JSON.stringify(card.path === 'touch' ? { id: card.id, taps: card.taps } : { id: card.id })
      : snap
        ? undefined
        : JSON.stringify({ message: message ?? '', image, live, story });
  const run = (token: string) =>
    streamFetch(`${urlFor(lane)}${whoPath(`/companion/${path}`)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
      body,
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
  if (res.status === 404 && view) throw new CompanionRefused("That photo is gone, or this Mac's maestro is too old for views.");
  if (res.status === 404)
    throw new CompanionRefused(card ? "This Mac's maestro is too old for that." : snap ? "This Mac's maestro is too old for the camera button." : "This Mac's maestro has no companion.");
  if (res.status === 409) {
    // Another companion's turn is running (one at a time on the Mac): nothing of this one
    // is pending, so it is a refusal to show, not a turn to wait for.
    const detail = ((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? '';
    // One at a time across companions, or a touch the moment no longer allows (touch.py).
    if (detail.includes('one at a time') || detail.includes("doesn't fit")) throw new CompanionRefused(detail);
    throw new Error('She is still answering.');
  }
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
      let data: {
        message?: string;
        text?: string;
        done?: number;
        total?: number;
        name?: string;
        model?: string;
        scene?: string;
        once?: boolean;
        until?: string;
        seconds?: number;
      };
      try {
        data = JSON.parse(frame.data);
      } catch {
        continue; // a malformed frame is not worth losing the reply over
      }
      if (frame.event === 'status') onEvent({ kind: 'typing' });
      else if (frame.event === 'token' && data.text) onEvent({ kind: 'token', text: data.text });
      else if (frame.event === 'response' && data.message) onEvent({ kind: 'reply', text: data.message, seconds: data.seconds });
      else if (frame.event === 'retake') onEvent({ kind: 'retake' });
      else if (frame.event === 'seen') onEvent({ kind: 'seen' });
      else if (frame.event === 'away' && data.until)
        onEvent({ kind: 'away', away: { until: data.until, reason: (data.message ?? '').replace(/^\S+ is /, '') || 'busy' } });
      else if (frame.event === 'photo_status') onEvent({ kind: 'photoStarted' });
      else if (frame.event === 'progress' && typeof data.done === 'number' && typeof data.total === 'number')
        onEvent({ kind: 'progress', done: data.done, total: data.total });
      else if (frame.event === 'image' && data.name)
        onEvent({
          kind: 'photo',
          photo: { name: data.name, model: data.model ?? '', scene: data.scene ?? '', once: data.once, seconds: data.seconds },
        });
      else if (frame.event === 'photo_error') onEvent({ kind: 'photoFailed', message: data.message ?? 'The photo failed.' });
      else if (frame.event === 'error') throw new CompanionRefused(data.message ?? 'Something went wrong on the Mac.');
    }
  }
  throw new Error('The stream ended before she finished.');
}

/**
 * The photo director (maestro companion/director.py): he picks each part of a photo — who
 * is in it, whose eyes, the camera, how far, the place, the clothes and their colour, her
 * body, her face, the light — and the Mac draws exactly that, with no planning guess. The
 * fields and their chips come from the Mac; nothing about her is in this app.
 */
export type DirectorField = {
  id: string;
  label: string;
  /** pick: one of `choices` only; text: free words, `choices` are suggestions. */
  kind: 'pick' | 'text';
  hint: string;
  choices: { value: string; label: string }[];
};
/** Field id → his value. Empty fields are filled on the Mac from her state. */
export type Direction = Record<string, string>;
export type Director = {
  fields: DirectorField[];
  /** What he pinned: it holds while the scene it was made in lasts (same place, no session break). */
  pins: Direction;
  /** What each empty field is right now: the scene, as her state has it. */
  defaults: Direction;
  /** Chips that fit the scene, per text field, shown before the fixed ones (older Macs: absent). */
  suggest?: Record<string, string[]>;
  /** Fault chips for correcting a photo. */
  faults: { id: string; label: string }[];
};

/** Director mode: the camera button opens the director instead of taking a photo of the moment.
 * Kept for the app's run, like liveMode. */
let directorOn = false;
export const directorMode = { get: () => directorOn, set: (on: boolean) => void (directorOn = on) };

const refused = async (res: Response, old: string) => {
  if (res.status === 404) return old;
  const detail = ((await res.json().catch(() => ({}))) as { detail?: unknown }).detail;
  return typeof detail === 'string' ? detail : `The Mac refused (${res.status}).`;
};

export async function fetchDirector(lane: Lane): Promise<Director> {
  const res = await authedFetch(lane, whoPath('/companion/director'));
  if (!res.ok) throw new Error(await refused(res, "This Mac's maestro is too old for the director."));
  return (await res.json()) as Director;
}

/** The moment as the Mac would plan its photo (one call on her model, ~10–20 s): chips to change. */
export async function directorFromMoment(lane: Lane): Promise<Direction> {
  const res = await post(lane, whoPath('/companion/director/moment'), {});
  if (!res.ok) throw new Error(await refused(res, "This Mac's maestro is too old to plan from the moment."));
  return ((await res.json()) as { direction: Direction }).direction;
}

export type DirectRequest = {
  direction: Direction;
  /** One of her photos: drawn with its seed, so only what he changed changes. */
  like?: string;
  /** Keep these choices for the next directed photos. */
  pin?: boolean;
  count?: number;
};

/** The prompt his choices make, and what the Mac changed of them (a camera that cannot fit). */
export async function previewDirection(lane: Lane, req: DirectRequest): Promise<{ prompt: string; notes: string[] }> {
  const res = await post(lane, whoPath('/companion/director/preview'), req);
  if (!res.ok) throw new Error(await refused(res, 'That photo is gone.'));
  return (await res.json()) as { prompt: string; notes: string[] };
}

/** His photo, queued on the Mac: it arrives like her other queued photos (`photos` in fetchCompanion). */
export async function directPhoto(lane: Lane, req: DirectRequest): Promise<void> {
  const res = await post(lane, whoPath('/companion/direct'), req);
  if (!res.ok) throw new Error(await refused(res, 'That photo is gone.'));
  await res.text(); // a short stream: queued, done
}

export async function clearDirection(lane: Lane): Promise<void> {
  const res = await authedFetch(lane, whoPath('/companion/director'), { method: 'DELETE' });
  if (!res.ok) throw new Error(await refused(res, "This Mac's maestro is too old for the director."));
}

/** What came out wrong in one of her photos: a lesson for the next ones, and with
 * `retake` the same photo again, fixes first. */
export async function correctPhoto(lane: Lane, name: string, wrong: string[], retake: boolean): Promise<void> {
  const res = await post(lane, whoPath('/companion/correct'), { name, wrong, retake });
  if (!res.ok) throw new Error(await refused(res, "That photo is gone, or this Mac's maestro is too old."));
  await res.text();
}

/**
 * Her page (maestro companion/page.py). The Mac writes every word on it: the app only draws
 * the kinds of card, so nothing of hers is in this public repo.
 */
type CardLook = { icon?: string; section?: string };

export type ProfileCard = CardLook &
  (
    | { kind: 'meter'; title: string; value: number; caption?: string }
    | { kind: 'stat'; title: string; value: string; caption?: string }
    | { kind: 'ring'; title: string; value: number; max: number; caption?: string }
    | { kind: 'text'; title: string; value: string }
  );

export type CompanionProfile = {
  name: string;
  age: number;
  face: string | null;
  now: string;
  cards: ProfileCard[];
  links: { id: 'diary' | 'memory'; title: string; icon?: string }[];
  /** Busy right now and back at `until`; null when she is here. Absent on an older maestro. */
  away?: CompanionAway | null;
};

export type ProfilePhoto = { name: string; at: string; liked: boolean; faults?: string[] };

export async function fetchProfile(lane: Lane): Promise<CompanionProfile> {
  const res = await authedFetch(lane, whoPath('/companion/profile'));
  if (!res.ok) throw new Error(res.status === 404 ? "This Mac's maestro is too old for her page." : `The Mac refused (${res.status}).`);
  return (await res.json()) as CompanionProfile;
}

/** Her photos, newest first, a page at a time: `before` is the last one's `at`. */
/** `total`: all of her photos, not this page's (absent on an older maestro). */
export type PhotoPage = { photos: ProfilePhoto[]; more: boolean; total?: number };

export async function fetchPhotos(lane: Lane, before = ''): Promise<PhotoPage> {
  const query = before ? `&before=${encodeURIComponent(before)}` : '';
  const path = whoPath('/companion/photos');
  const res = await authedFetch(lane, `${path}${path.includes('?') ? '&' : '?'}limit=30${query}`);
  if (!res.ok) throw new Error(`The Mac refused (${res.status}).`);
  return (await res.json()) as PhotoPage;
}

/** Copy his hearted photos, captioned, next to her face model on the Mac, for a later retrain. */
export async function makeTrainingSet(lane: Lane): Promise<number> {
  const res = await post(lane, whoPath('/companion/training'), {});
  if (!res.ok) throw new Error(`The Mac refused (${res.status}).`);
  return ((await res.json()) as { copied: number }).copied;
}

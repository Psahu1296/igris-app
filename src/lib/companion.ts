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
export type CompanionPhoto = { name: string; model: string; scene: string };

export type CompanionMessage = { role: 'you' | 'her'; text: string; at: string; image?: CompanionPhoto };

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
};

/**
 * What the chat shows for a snapshot from the Mac: the saved messages, plus the turn in
 * flight. While she types, his message is not saved yet, so it is added here; while a
 * photo is taken, her words are not saved yet (they are saved with the photo), so they are.
 */
export function shown(c: Companion): {
  messages: CompanionMessage[];
  /** Her words so far while she types, else null. */
  live: string | null;
  snapping: { done: number; total: number } | null;
} {
  const p = c.pending;
  if (!p) return { messages: c.messages, live: null, snapping: null };
  const messages = p.saved ? [...c.messages] : [...c.messages, { role: 'you' as const, text: p.message, at: p.at }];
  if (!p.photo) return { messages, live: p.text, snapping: null };
  if (p.text) messages.push({ role: 'her', text: p.text, at: `${p.at}+her` });
  return { messages, live: null, snapping: p.photo };
}

/**
 * Her words cut into what she says and what she does: she writes feelings and body
 * language between asterisks ("*sharma ke*", maestro companion/persona.py), and the chat
 * shows those in italics without the asterisks. An unclosed "*" (half a message, while
 * it streams) stays as written.
 */
export function emotes(text: string): { text: string; action: boolean }[] {
  const out: { text: string; action: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(/\*([^*\n]{1,120})\*/g)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index), action: false });
    out.push({ text: m[1].trim(), action: true });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), action: false });
  return out;
}

/** Her photos are portrait, like a phone's (photos.SIZE, 768 × 960). */
export const PHOTO_ASPECT = 768 / 960;

export async function fetchCompanion(lane: Lane): Promise<Companion> {
  const res = await authedFetch(lane, '/companion');
  if (!res.ok) throw new Error(res.status === 404 ? 'Not here.' : `The Mac refused (${res.status}).`);
  return (await res.json()) as Companion;
}

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
  /** After her words: a photo is being taken, its mflux steps, the photo, or why not. */
  | { kind: 'photoStarted' }
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'photo'; photo: CompanionPhoto }
  | { kind: 'photoFailed'; message: string };

/**
 * Her words as they stream, without the `[photo: …]` tag she ends a message with — the
 * tag is for maestro, and half of one ("[pho") shows up before it can be matched whole.
 */
export const withoutTag = (text: string) => text.replace(/\s*\[(?:p|ph|pho|phot|photo|s|se|sel|self|selfi|selfie|pic|image)(?::[^\]]*)?\]?\s*$/i, '').replace(/\s*\[(?:photo|selfie|pic|image)\s*:[^\]]*\]\s*/gi, ' ').trimEnd();

/**
 * Send one message and stream her reply; or, with no `message`, the camera button: she
 * sends a photo of the moment the chat is in, with a line of her own, and nothing of his
 * is saved (maestro POST /companion/snap). The same bearer-token dance as streamChat: one
 * re-login on a 401, since signing in elsewhere evicts the phone's token.
 *
 * Throws CompanionRefused when the Mac refused the turn. Any other error (the socket died
 * with the screen off, the stream ended early, a 409 because a turn is already running)
 * leaves the turn to the Mac: read `pending` from fetchCompanion to pick it up.
 */
export async function streamCompanion(opts: {
  lane: Lane;
  message?: string;
  onEvent: (event: CompanionEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { lane, message, onEvent, signal } = opts;
  const run = (token: string) =>
    streamFetch(`${urlFor(lane)}/companion/${message === undefined ? 'snap' : 'stream'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
      body: message === undefined ? undefined : JSON.stringify({ message }),
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
    throw new CompanionRefused(message === undefined ? "This Mac's maestro is too old for the camera button." : "This Mac's maestro has no companion.");
  if (res.status === 409) throw new Error('She is still answering.');
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
      let data: { message?: string; text?: string; done?: number; total?: number; name?: string; model?: string; scene?: string };
      try {
        data = JSON.parse(frame.data);
      } catch {
        continue; // a malformed frame is not worth losing the reply over
      }
      if (frame.event === 'status') onEvent({ kind: 'typing' });
      else if (frame.event === 'token' && data.text) onEvent({ kind: 'token', text: data.text });
      else if (frame.event === 'response' && data.message) onEvent({ kind: 'reply', text: data.message });
      else if (frame.event === 'photo_status') onEvent({ kind: 'photoStarted' });
      else if (frame.event === 'progress' && typeof data.done === 'number' && typeof data.total === 'number')
        onEvent({ kind: 'progress', done: data.done, total: data.total });
      else if (frame.event === 'image' && data.name)
        onEvent({ kind: 'photo', photo: { name: data.name, model: data.model ?? '', scene: data.scene ?? '' } });
      else if (frame.event === 'photo_error') onEvent({ kind: 'photoFailed', message: data.message ?? 'The photo failed.' });
      else if (frame.event === 'error') throw new CompanionRefused(data.message ?? 'Something went wrong on the Mac.');
    }
  }
  throw new Error('The stream ended before she finished.');
}

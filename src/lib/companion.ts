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

export type CompanionMessage = { role: 'you' | 'her'; text: string; at: string };

export type Companion = { name: string; age: number; model: string; messages: CompanionMessage[] };

export async function fetchCompanion(lane: Lane): Promise<Companion> {
  const res = await authedFetch(lane, '/companion');
  if (!res.ok) throw new Error(res.status === 404 ? 'Not here.' : `The Mac refused (${res.status}).`);
  return (await res.json()) as Companion;
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
  | { kind: 'reply'; text: string };

/**
 * Send one message and stream her reply. The same bearer-token dance as streamChat: one
 * re-login on a 401, since signing in elsewhere evicts the phone's token.
 */
export async function streamCompanion(opts: {
  lane: Lane;
  message: string;
  onEvent: (event: CompanionEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { lane, message, onEvent, signal } = opts;
  const run = (token: string) =>
    streamFetch(`${urlFor(lane)}/companion/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message }),
      signal,
    });

  let token = await secure.loadToken(lane);
  let res = token ? await run(token) : null;
  if (!res || res.status === 401) {
    // authedFetch re-logs in on a 401; a cheap GET lets it refresh the token first.
    await fetchCompanion(lane);
    token = await secure.loadToken(lane);
    if (!token) throw new Error('Not signed in.');
    res = await run(token);
  }
  if (res.status === 404) throw new Error("This Mac's maestro has no companion.");
  if (!res.ok) throw new Error(`The Mac returned ${res.status}.`);
  if (!res.body) throw new Error('The Mac sent no response body.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parse = createSseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const frame of parse(decoder.decode(value, { stream: true }))) {
      if (frame.event === 'done') return;
      let data: { message?: string; text?: string };
      try {
        data = JSON.parse(frame.data);
      } catch {
        continue; // a malformed frame is not worth losing the reply over
      }
      if (frame.event === 'status') onEvent({ kind: 'typing' });
      else if (frame.event === 'token' && data.text) onEvent({ kind: 'token', text: data.text });
      else if (frame.event === 'response' && data.message) onEvent({ kind: 'reply', text: data.message });
      else if (frame.event === 'error') throw new Error(data.message ?? 'Something went wrong on the Mac.');
    }
  }
}

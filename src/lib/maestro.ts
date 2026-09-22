import { fetch as streamFetch } from 'expo/fetch';

import { LOCAL_URL, PROBE_TIMEOUT_MS, SESSION_ID, urlFor, type Lane } from '@/lib/config';
import { createSseParser } from '@/lib/sse';
import * as secure from '@/lib/secure';

export type { Lane };

/** Credentials were rejected outright — re-logging in will not help. */
export class AuthError extends Error {}

/**
 * Which brain answers this turn.
 *
 * The Mac is preferred whenever it is reachable: it is free, has every tool, and
 * answers in about a second. Render is the fallback, not a peer. We never wait
 * long for the Mac — on the tailnet /health returns in tens of milliseconds, so a
 * slow probe means "asleep", and waiting longer just delays the real answer.
 */
export async function probeLane(): Promise<Lane> {
  if (!LOCAL_URL) return 'cloud';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${LOCAL_URL}/health`, { signal: controller.signal });
    if (res.ok) {
      const body = (await res.json()) as { status?: string };
      if (body.status === 'ok') return 'local';
    }
  } catch {
    // Unreachable, refused, DNS miss, or we aborted. All mean the same thing.
  } finally {
    clearTimeout(timer);
  }
  return 'cloud';
}

/**
 * Tokens are stored per lane on purpose. maestro validates a bearer token against
 * Postgres on every call, so a token only works on lanes sharing that database —
 * and the Mac may well be pointed at a local one. Keeping them separate means the
 * wrong-database case degrades to one extra login instead of a confusing 401 loop.
 */
export async function login(lane: Lane, username: string, password: string): Promise<string> {
  const res = await fetch(`${urlFor(lane)}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (res.status === 401) throw new AuthError('Those credentials were rejected.');
  if (res.status === 429) throw new Error('Too many sign-in attempts. Wait a minute.');
  if (!res.ok) throw new Error(`Sign-in failed (${res.status}).`);

  const body = (await res.json()) as { token: string };
  await secure.saveToken(lane, body.token);
  return body.token;
}

async function tokenFor(lane: Lane): Promise<string> {
  const existing = await secure.loadToken(lane);
  if (existing) return existing;

  const creds = await secure.loadCredentials();
  if (!creds) throw new AuthError('Not signed in.');
  return login(lane, creds.username, creds.password);
}

/** What the transcript needs to know about a turn in flight. */
export type TurnEvent =
  | { kind: 'status'; message: string }
  | { kind: 'answer'; message: string };

/**
 * Ask Igris, streaming maestro's own progress events back as they arrive.
 *
 * maestro does not stream tokens — it emits discrete stage events (classifying,
 * agent_started) and then one complete `response`. We surface maestro's own
 * wording for those stages rather than inventing a progress bar, because they are
 * true: they say which node of the graph is running.
 */
export async function streamChat(opts: {
  lane: Lane;
  message: string;
  onEvent: (event: TurnEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { lane, message, onEvent, signal } = opts;

  const run = async (token: string) => {
    const res = await streamFetch(`${urlFor(lane)}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message, session_id: SESSION_ID }),
      signal,
    });
    return res;
  };

  let res = await run(await tokenFor(lane));

  // A 401 here is routine, not exceptional: maestro keeps ONE session_token per
  // credential row, so signing into ai-playground for a demo evicts the phone.
  // Re-login once with the stored password and carry on — the alternative is
  // asking for a master password mid-conversation.
  if (res.status === 401) {
    const creds = await secure.loadCredentials();
    if (!creds) throw new AuthError('Not signed in.');
    await secure.clearToken(lane);
    res = await run(await login(lane, creds.username, creds.password));
  }

  if (!res.ok) throw new Error(`Igris returned ${res.status}.`);
  if (!res.body) throw new Error('Igris sent no response body.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder(); // UTF-8 only on Hermes, which is all we send
  const parse = createSseParser();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    for (const frame of parse(decoder.decode(value, { stream: true }))) {
      if (frame.event === 'done') return;

      let text: string;
      try {
        text = (JSON.parse(frame.data) as { message?: string }).message ?? '';
      } catch {
        continue; // a malformed frame is not worth killing the turn over
      }
      if (!text) continue;

      onEvent(
        frame.event === 'response' ? { kind: 'answer', message: text } : { kind: 'status', message: text }
      );
    }
  }
}

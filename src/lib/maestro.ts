import { fetch as streamFetch } from 'expo/fetch';

import {
  LOCAL_URL,
  PROBE_TIMEOUT_MS,
  urlFor,
  type Lane,
  type LanePreference,
} from '@/lib/config';
import { DEVICE_CAPABILITIES, parseDeviceAction, type DeviceAction } from '@/lib/device';
import { createSseParser } from '@/lib/sse';
import * as secure from '@/lib/secure';

export type { Lane, LanePreference };

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

/**
 * A request that carries the lane's bearer token and survives its eviction.
 *
 * maestro keeps ONE session_token per credential row, so signing in anywhere else
 * silently invalidates the phone's. That makes a 401 routine rather than
 * exceptional, and every authenticated call needs the same re-login-once dance —
 * so it lives here instead of being copied per endpoint.
 */
export async function authedFetch(
  lane: Lane,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const run = (token: string) =>
    fetch(`${urlFor(lane)}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });

  const res = await run(await tokenFor(lane));
  if (res.status !== 401) return res;

  const creds = await secure.loadCredentials();
  if (!creds) throw new AuthError('Not signed in.');
  await secure.clearToken(lane);
  return run(await login(lane, creds.username, creds.password));
}

/**
 * Send recorded audio to the Mac and get words back.
 *
 * The phone does not transcribe. A 20M on-device recogniser heard "how is the weather
 * in my city" as "ular in my city", and nothing short of a far bigger model fixes that
 * — so the Mac's Whisper does it, with the domain prompt that knows "Igris" and
 * "dhaba". This is cloud-lane-hostile by nature: Render has no Whisper, so callers
 * must keep it on the local lane.
 */
export async function transcribe(lane: Lane, wav: Uint8Array): Promise<string> {
  const res = await authedFetch(lane, '/stt', {
    method: 'POST',
    headers: { 'Content-Type': 'audio/wav' },
    body: wav as unknown as BodyInit,
  });

  if (res.status === 404) {
    throw new Error('This Igris has no /stt endpoint. The Mac needs to be running a current maestro.');
  }
  if (!res.ok) throw new Error(`Transcription failed (${res.status}).`);

  const body = (await res.json()) as { text?: string };
  return (body.text ?? '').trim();
}

/**
 * Where a turn is, in the terms maestro actually streams. `working` means an agent
 * was started (`agent_started`) — the dhaba analyst, the researcher — which is the
 * part of a turn that calls tools. Direct replies never enter it, and that is
 * correct, not a gap. There is no 'answering' here on purpose: maestro sends the
 * whole answer as one `response` frame at the end, so the phase would last a frame.
 */
export type Phase = 'thinking' | 'working';

/** What the transcript needs to know about a turn in flight. */
export type TurnEvent =
  | { kind: 'status'; message: string; phase: Phase }
  | { kind: 'answer'; message: string }
  /** Something for the phone to do (lib/device.ts). Arrives just before the answer. */
  | { kind: 'device'; action: DeviceAction }
  /** The turn changed the todo list; the phone re-syncs its alarms (lib/todos.ts). */
  | { kind: 'todos' }
  /** A tutor question with options to tap. Arrives just before the answer. */
  | { kind: 'quiz'; card: QuizCard };

/** A multiple-choice question from the tutor (maestro tutor/session.py): tap to answer. */
export type QuizCard = { kind: 'mcq'; question: string; options: string[] };

/** Unknown event names fall back to thinking, so a new maestro event can't stall the UI. */
const phaseOf = (event: string): Phase => (event === 'agent_started' ? 'working' : 'thinking');

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
  /** Which conversation this turn belongs to — maestro uses it as the thread_id. */
  sessionId: string;
  /** Set when this message starts a todo's tutor session (the alarm's Start). */
  todoSession?: { todo_id: string; occurrence_at: string | null };
  onEvent: (event: TurnEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { lane, message, sessionId, todoSession, onEvent, signal } = opts;

  const run = async (token: string) => {
    const res = await streamFetch(`${urlFor(lane)}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        session_id: sessionId,
        capabilities: DEVICE_CAPABILITIES,
        todo_session: todoSession ?? null,
      }),
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

      if (frame.event === 'tutor_card') {
        try {
          const card = JSON.parse(frame.data) as QuizCard;
          if (card.kind === 'mcq' && Array.isArray(card.options)) onEvent({ kind: 'quiz', card });
        } catch {
          // malformed: the question is still in the spoken answer
        }
        continue;
      }

      if (frame.event === 'todos_changed') {
        onEvent({ kind: 'todos' });
        continue;
      }

      if (frame.event === 'device_action') {
        let action: DeviceAction | null = null;
        try {
          action = parseDeviceAction(JSON.parse(frame.data));
        } catch {
          // malformed: ignored below, like any other bad frame
        }
        if (action) onEvent({ kind: 'device', action });
        continue;
      }

      let text: string;
      try {
        text = (JSON.parse(frame.data) as { message?: string }).message ?? '';
      } catch {
        continue; // a malformed frame is not worth killing the turn over
      }
      if (!text) continue;

      // The event NAME used to be dropped here, which is why the app could only ever
      // show "some status". It now carries the phase through to the loader.
      onEvent(
        frame.event === 'response'
          ? { kind: 'answer', message: text }
          : { kind: 'status', message: text, phase: phaseOf(frame.event) }
      );
    }
  }
}

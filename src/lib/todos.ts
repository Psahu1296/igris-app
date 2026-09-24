import { PermissionsAndroid, Platform } from 'react-native';

import IgrisDevice, { type TodoAlarmAccess } from '../../modules/igris-device';
import type { Lane } from '@/lib/config';
import { authedFetch } from '@/lib/maestro';

/**
 * Todos: maestro keeps them, the phone rings for them.
 *
 * maestro cannot poke on time — Render sleeps and there is no push — so the phone
 * pulls the schedule (every firing in the next week, recurrence and snoozes already
 * applied server-side) and arms each as a native exact alarm (TodoAlarms.kt). What the
 * user does when one rings happens natively, often with the app closed, and waits in
 * a native outbox until the next sync sends it here first.
 *
 * Sync runs on launch, on returning to the foreground, after a turn that changed the
 * list (maestro's `todos_changed` frame), and after any change on the Todos screen.
 * Until one of those happens, the alarms armed last time still fire — a week's worth.
 */

export type Priority = 'normal' | 'high' | 'must';

export type Recurrence = { freq: 'daily' | 'weekdays' | 'weekly'; days: number[]; times: string[] };

export type Todo = {
  id: string;
  title: string;
  due_at: string | null;
  priority: Priority;
  recurrence: Recurrence | null;
  session: { mode: string; brief: string } | null;
  done_on_ack: boolean;
  status: 'open' | 'done' | 'cancelled';
  progress: Progress | null;
};

/** A daily must-do's standing (maestro todos.progress). Null for any other todo. */
export type Progress = {
  streak: number;
  today: 'done' | 'missed' | 'open' | 'off';
  missed_yesterday: boolean;
  slots: { at: string; state: 'done' | 'skipped' | 'cleared' | 'open' | 'upcoming' }[];
};

/** Rules come from maestro (todos._rules); the phone only obeys them. */
type Firing = {
  todo_id: string;
  title: string;
  occurrence_at: string;
  fire_at: string;
  priority: Priority;
  session: Todo['session'];
  done_on_ack: boolean;
  can_skip: boolean;
  max_snoozes: number | null;
  snoozed: number;
  repoke_every_min: number | null;
  repoke_until: string | null;
  note: string | null;
  /** Done at this slot means done for the day: the phone cancels the day's other slots. */
  closes_day: boolean;
};

type OutboxEvent = {
  id: string;
  todo_id: string;
  occurrence_at: string;
  kind: 'done' | 'ack' | 'snooze' | 'skip' | 'session_complete';
  at_ms: number;
  until_ms?: number;
};

/** A week, so an unopened app keeps ringing on time for that long. */
const HORIZON_HOURS = 168;

const android = () => (Platform.OS === 'android' ? IgrisDevice : null);

async function json<T>(res: Response, what: string): Promise<T> {
  if (res.status === 404) throw new Error('This Igris has no todos yet. Update maestro.');
  if (!res.ok) throw new Error(`${what} failed (${res.status}).`);
  return (await res.json()) as T;
}

export async function listTodos(lane: Lane): Promise<Todo[]> {
  return (await json<{ todos: Todo[] }>(await authedFetch(lane, '/todos'), 'Loading todos')).todos;
}

/** Done from the list. A recurring todo's current slot is worked out by maestro. */
export async function completeTodo(lane: Lane, todo: Todo): Promise<void> {
  await json(
    await authedFetch(lane, `/todos/${todo.id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: todo.done_on_ack ? 'ack' : 'done', at: new Date().toISOString() }),
    }),
    'Marking it done'
  );
}

export async function deleteTodo(lane: Lane, todo: Todo): Promise<void> {
  await json(await authedFetch(lane, `/todos/${todo.id}`, { method: 'DELETE' }), 'Deleting it');
}

/** Send what was done on the alarm screen. Returns how many maestro accepted. */
async function flushOutbox(lane: Lane): Promise<number> {
  const device = android();
  if (!device) return 0;
  const events = JSON.parse(device.todoOutbox()) as OutboxEvent[];
  const sent: string[] = [];
  for (const e of events) {
    const res = await authedFetch(lane, `/todos/${e.todo_id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: e.kind,
        at: new Date(e.at_ms).toISOString(),
        occurrence_at: e.occurrence_at,
        until: e.until_ms ? new Date(e.until_ms).toISOString() : null,
      }),
    });
    // 404 and 422 will never succeed (a todo deleted since, a slot that no longer
    // exists); keeping them would retry forever. Anything else waits for next time.
    if (res.ok || res.status === 404 || res.status === 422) sent.push(e.id);
    else break;
  }
  if (sent.length) device.clearTodoOutbox(sent);
  return sent.length;
}

let running: Promise<number> | null = null;

/**
 * Outbox up, schedule down, alarms armed. Returns how many alarms are armed. One at a
 * time: launch and a foreground event arrive together, and two interleaved syncs
 * could arm a schedule fetched before the other's events were sent.
 */
export function syncTodos(lane: Lane): Promise<number> {
  const device = android();
  if (!device) return Promise.resolve(0);
  running ??= (async () => {
    try {
      await flushOutbox(lane);
      const { firings } = await json<{ firings: Firing[] }>(
        await authedFetch(lane, `/todos/schedule?hours=${HORIZON_HOURS}`),
        'Loading the schedule'
      );
      if (firings.length) await askForNotifications();
      const armed = firings.map((f) => ({
        ...f,
        fire_at_ms: Date.parse(f.fire_at),
        repoke_every_ms: (f.repoke_every_min ?? 0) * 60_000,
        repoke_until_ms: f.repoke_until ? Date.parse(f.repoke_until) : 0,
      }));
      return device.armTodos(JSON.stringify(armed));
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Android 13+ asks once; before that notifications are on by default. */
async function askForNotifications() {
  if (Platform.OS !== 'android' || Platform.Version < 33) return;
  const permission = 'android.permission.POST_NOTIFICATIONS' as const;
  if (!(await PermissionsAndroid.check(permission))) await PermissionsAndroid.request(permission);
}

export function alarmAccess(): TodoAlarmAccess | null {
  return android()?.todoAlarmAccess() ?? null;
}

export function openAlarmSettings(which: keyof TodoAlarmAccess) {
  android()?.openTodoAlarmSettings(which);
}

// ── Starting a session from the alarm screen ─────────────────────────────────

/**
 * The alarm screen's Start opens igris://todo?… (src/app/todo.tsx), which leaves the
 * brief here and returns to the chat; the chat takes it, opens a fresh conversation
 * and asks it. A module variable, not route params, because the chat screen is
 * usually already mounted underneath and would not re-read its params.
 */
export type SessionStart = { todoId: string; occurrence: string | null; title: string; brief: string };

let pendingStart: SessionStart | null = null;
const startListeners = new Set<() => void>();

export function requestSessionStart(start: SessionStart) {
  pendingStart = start;
  startListeners.forEach((l) => l());
}

export function takeSessionStart(): SessionStart | null {
  const start = pendingStart;
  pendingStart = null;
  return start;
}

export function onSessionStart(listener: () => void): () => void {
  startListeners.add(listener);
  return () => startListeners.delete(listener);
}

// ── Saying when ───────────────────────────────────────────────────────────────

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function describeRecurrence(r: Recurrence): string {
  const when =
    r.freq === 'daily'
      ? 'Every day'
      : r.freq === 'weekdays'
        ? 'Weekdays'
        : r.days.map((d) => WEEKDAYS[d].slice(0, 3)).join(', ');
  return `${when} · ${r.times.map(clock).join(', ')}`;
}

export function describeDue(iso: string, now = new Date()): string {
  const due = new Date(iso);
  const time = clock(`${due.getHours()}:${due.getMinutes()}`);
  const days = Math.round(
    (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000
  );
  if (days === 0) return `Today · ${time}`;
  if (days === 1) return `Tomorrow · ${time}`;
  if (days === -1) return `Yesterday · ${time}`;
  if (days > 1 && days < 7) return `${WEEKDAYS[(due.getDay() + 6) % 7]} · ${time}`;
  return `${due.getDate()} ${due.toLocaleString('en-IN', { month: 'short' })} · ${time}`;
}

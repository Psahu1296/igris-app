import type { Lane } from '@/lib/config';
import { authedFetch } from '@/lib/maestro';

/**
 * Interview prep (maestro /prep/*): the day-by-day plan and the 100-question bank.
 *
 * The same store Claude Code's /interview-prep uses on the Mac — a question answered
 * here does not come back there as new, and a task ticked there is ticked here. maestro
 * grades answers typed or dictated on the phone; Claude Code sends scores it decided.
 * Owner only: anyone else gets a 404, which the screen shows as "not available".
 */

export type PrepTask = {
  key: string;
  text: string;
  quiz: { section: string | null; n: number } | null;
  done: boolean;
};

export type PrepDay = {
  day: string;
  week: string | null;
  tasks: PrepTask[];
  first: string;
  last: string;
  readiness: number;
};

export type PrepQuestion = { id: number; section: string; question: string; star: boolean; last: number | null };

export type PrepGrade = {
  score: number;
  right: string;
  missing: string;
  say_it: string;
  note: string;
  model_answer: string;
};

export type PrepReport = {
  readiness: number;
  seen: number;
  total: number;
  due: number;
  sections: { section: string; title: string; total: number; seen: number; score: number | null }[];
  weakest: { id: number; section: string; question: string; score: number }[];
};

/** Streak, XP and rank — maestro prep/habit.py, recomputed from every answer. */
export type Habit = {
  streak: number;
  best: number;
  freezes: number;
  done_today: boolean;
  today_xp: number;
  goal: number;
  total_xp: number;
  level: number;
  rank: string;
  next: string | null;
  progress: number;
  to_next: number;
  week: { day: string; xp: number; frozen: boolean }[];
};

/** A read-code card as shown: no answer. `i` is the option's id to send back. */
export type PyCard = {
  id: string;
  kata: number;
  kind: 'output' | 'blank' | 'bug';
  ask: string;
  code: string;
  options: { i: number; text: string }[];
};

export type PyNext = {
  card: PyCard | null;
  unlocked: number;
  mastery: { total: number; seen: number; solid: number };
};

export type PyResult = {
  right: boolean;
  answer: string;
  why: string;
  fixed: string | null;
  xp: number;
  habit: Habit;
  goal_hit: boolean;
  streak_up: boolean;
  rank_up: boolean;
};

export class PrepUnavailable extends Error {}

async function json<T>(res: Response, what: string): Promise<T> {
  if (res.status === 404) throw new PrepUnavailable('Prep is not available on this login.');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
    throw new Error(typeof body?.detail === 'string' ? body.detail : `${what} failed (${res.status}).`);
  }
  return (await res.json()) as T;
}

const put = (body: unknown): RequestInit => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const post = (body: unknown): RequestInit => ({ ...put(body), method: 'POST' });

export async function prepDay(lane: Lane, day?: string): Promise<PrepDay> {
  return json(await authedFetch(lane, `/prep/today${day ? `?day=${day}` : ''}`), 'Loading the plan');
}

export async function tickTask(lane: Lane, day: string, task: string, done: boolean): Promise<void> {
  await json(await authedFetch(lane, '/prep/ticks', put({ day, task, done })), 'Ticking the task');
}

export async function nextQuestions(lane: Lane, n: number, section: string | null): Promise<PrepQuestion[]> {
  const q = `?n=${n}${section ? `&section=${section}` : ''}`;
  return (await json<{ questions: PrepQuestion[] }>(await authedFetch(lane, `/prep/next${q}`), 'Loading questions'))
    .questions;
}

export async function answerQuestion(lane: Lane, id: number, answer: string): Promise<PrepGrade> {
  return json(await authedFetch(lane, `/prep/questions/${id}/answer`, post({ answer })), 'Grading');
}

/** A skip: score 1 without a grading call, then the model answer to read. */
export async function skipQuestion(lane: Lane, id: number): Promise<string> {
  await json(await authedFetch(lane, `/prep/questions/${id}/grade`, post({ score: 1, note: 'skipped' })), 'Skipping');
  return (await json<{ answer: string }>(await authedFetch(lane, `/prep/questions/${id}`), 'Loading the answer')).answer;
}

export async function prepHabit(lane: Lane): Promise<Habit> {
  return json(await authedFetch(lane, '/prep/habit'), 'Loading your streak');
}

export async function nextCard(lane: Lane, ahead: boolean, after: string | null): Promise<PyNext> {
  const q = `?ahead=${ahead}${after ? `&after=${encodeURIComponent(after)}` : ''}`;
  return json(await authedFetch(lane, `/prep/python/next${q}`), 'Loading a card');
}

export async function answerCard(lane: Lane, id: string, choice: number): Promise<PyResult> {
  return json(await authedFetch(lane, `/prep/python/${encodeURIComponent(id)}/answer`, post({ choice })), 'Checking');
}

export async function prepReport(lane: Lane): Promise<PrepReport> {
  return json(await authedFetch(lane, '/prep/report'), 'Loading the report');
}

/** "2026-10-24" ± days, in local time (the plan's days are IST dates; the phone is in IST). */
export function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + by);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

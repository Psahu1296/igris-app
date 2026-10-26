import { File, Paths } from 'expo-file-system';
import { printToFileAsync } from 'expo-print';
import { shareAsync } from 'expo-sharing';

import type { Lane } from '@/lib/config';
import { authedFetch } from '@/lib/maestro';

/**
 * The renovation planner (maestro renovate/, .scratch/renovate/PRD.md): his sketch and room
 * photos in, a costed plan page out. Runs on the Mac in the background; the phone polls
 * GET /renovate/{id} like Scout's jobs, since there is no push.
 *
 *   reading → needs_confirm (he fixes the rooms) → confirmed → planning → planned | failed
 *   planned | failed → (his correction) → confirmed → planning → …
 */

export type PlanStatus = 'reading' | 'needs_confirm' | 'confirmed' | 'planning' | 'planned' | 'failed';

/** A room in feet, as maestro keeps it. */
export type Room = { name: string; length: number; width: number; height: number };

export type PlanPhoto = {
  file: string;
  /** Which room he said it shows. */
  room: string;
  /** He said no one is in it: only then an after picture is drawn. */
  empty: boolean;
  after?: string;
  after_skipped?: string;
};

export type RenovationPlan = {
  id: string;
  request: string;
  budget: number | null;
  status: PlanStatus;
  created_at: string;
  rooms: Room[];
  /** What looks off in the sketch reading, for him to fix. */
  problems: string[];
  photos: PlanPhoto[];
  total?: { low: number; high: number; quotes: string[] };
  /** What Igris assumed or changed in code: what he is most likely to correct. */
  notes?: string[];
  /** His corrections so far, oldest first. */
  corrections?: string[];
  error: string;
  /** A signed path to the page, valid 30 minutes; present once it is planned. */
  link?: string;
};

/** One photo with what he says about it. */
export type NewPhoto = { base64: string; uri: string; room: string; empty: boolean };

export const isBusy = (p: RenovationPlan) => p.status === 'reading' || p.status === 'planning' || p.status === 'confirmed';

async function ok<T>(res: Response, what: string): Promise<T> {
  if (res.status === 404) throw new Error('This Igris has no renovation planner. The Mac needs a current maestro.');
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { detail?: unknown }).detail;
    throw new Error(typeof detail === 'string' ? detail : `Could not ${what} (${res.status}).`);
  }
  return (await res.json()) as T;
}

export async function myPlans(lane: Lane): Promise<RenovationPlan[]> {
  return (await ok<{ plans: RenovationPlan[] }>(await authedFetch(lane, '/renovate'), 'load your plans')).plans;
}

export async function getPlan(lane: Lane, id: string): Promise<RenovationPlan> {
  return ok<RenovationPlan>(await authedFetch(lane, `/renovate/${id}`), 'check the plan');
}

export async function startPlan(lane: Lane, message: string, sketch: string, photos: NewPhoto[]): Promise<RenovationPlan> {
  const res = await authedFetch(lane, '/renovate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sketch,
      photos: photos.map((p) => p.base64),
      photo_rooms: photos.map((p) => p.room.trim()),
      photo_empty: photos.map((p) => p.empty),
    }),
  });
  return ok<RenovationPlan>(res, 'start the plan');
}

export async function confirmRooms(lane: Lane, id: string, rooms: Room[]): Promise<RenovationPlan> {
  const res = await authedFetch(lane, `/renovate/${id}/rooms`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rooms }),
  });
  return ok<RenovationPlan>(res, 'confirm the rooms');
}

/** His correction to a finished plan: it goes back to planning with it. `rooms` is sent whole. */
export async function correctPlan(lane: Lane, id: string, note: string, rooms: Room[]): Promise<RenovationPlan> {
  const res = await authedFetch(lane, `/renovate/${id}/correct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note, rooms }),
  });
  return ok<RenovationPlan>(res, 'correct the plan');
}

/** The plan page's HTML, fetched with his token and shown in the app. Chrome was handed the
 * signed link at first and never reached the Mac (2026-10-26: no /renovate/dl in the log),
 * most likely its own secure DNS not resolving the tailnet's *.ts.net name. */
export async function planPage(lane: Lane, id: string): Promise<string> {
  const res = await authedFetch(lane, `/renovate/${id}/plan`);
  if (res.status === 404) throw new Error('The plan page is not ready yet.');
  if (!res.ok) throw new Error(`Could not open the plan (${res.status}).`);
  return res.text();
}

/** The plan as a PDF, handed to Android's share sheet (WhatsApp, Gmail…). Made on the phone
 * from the same page, photos and all: a link would need the Mac reachable from outside. */
export async function sharePlan(lane: Lane, id: string): Promise<void> {
  const { uri } = await printToFileAsync({ html: await planPage(lane, id) });
  const named = new File(Paths.cache, `Renovation plan ${id}.pdf`);
  if (named.exists) named.delete();
  new File(uri).move(named);
  await shareAsync(named.uri, { mimeType: 'application/pdf', dialogTitle: 'Share the renovation plan' });
}

const FT_PER_M = 3.2808;

/** A size as he types it, in his unit, to feet (maestro's unit). NaN when it is not a number. */
export const toFeet = (text: string, unit: 'm' | 'ft') => {
  const n = parseFloat(text.replace(',', '.'));
  return Math.round((unit === 'm' ? n * FT_PER_M : n) * 10) / 10;
};

/** Feet back to his unit, for showing. */
export const fromFeet = (ft: number, unit: 'm' | 'ft') =>
  ft ? String(Math.round((unit === 'm' ? ft / FT_PER_M : ft) * 100) / 100) : '';

/** ₹ with Indian grouping: 2,65,854. */
export const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

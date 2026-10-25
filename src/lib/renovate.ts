import { Linking } from 'react-native';

import { urlFor, type Lane } from '@/lib/config';
import { authedFetch } from '@/lib/maestro';

/**
 * The renovation planner (maestro renovate/, .scratch/renovate/PRD.md): his sketch and room
 * photos in, a costed plan page out. Runs on the Mac in the background; the phone polls
 * GET /renovate/{id} like Scout's jobs, since there is no push.
 *
 *   reading → needs_confirm (he fixes the rooms) → confirmed → planning → planned | failed
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
  notes?: string[];
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

/** Open the plan page in the browser. The link is fetched fresh: links expire. */
export async function openPlan(lane: Lane, id: string): Promise<void> {
  const plan = await getPlan(lane, id);
  if (!plan.link) throw new Error('The plan page is not ready yet.');
  await Linking.openURL(`${urlFor(lane)}${plan.link}`);
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

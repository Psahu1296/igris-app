import { Linking } from 'react-native';

import { urlFor, type Lane } from '@/lib/config';
import { authedFetch } from '@/lib/maestro';

/**
 * Scout: maestro's background jobs that find and check resources on the Mac
 * (maestro scout/, .scratch/scout/PRD.md). A turn that starts one gets a `scout_job`
 * frame; the phone then polls GET /scout/jobs until it finishes. There is no push —
 * Render sleeps, there is no FCM, and ColorOS freezes the app in the background — so a
 * job that finishes while the app is away is picked up on the next poll.
 */

export type ScoutStarted = { id: string; exam: string; years: number[] };

export type ScoutPaper = {
  /** The exam asked for, or a related one in the same pattern (maestro scout/related.py). */
  exam: string;
  /** null for a job's study plan, which is a file of the job but not a paper. */
  year: number | null;
  file: string;
  /** Where it was found. */
  url: string;
  pages: number;
  /** What the check saw: "32 pages, 100+ questions". */
  why: string;
  /** A signed path to download it without a token, valid for 30 minutes. */
  link: string;
};

export type ScoutJob = {
  id: string;
  thread_id: string;
  /** papers: find and check exam papers; exam_plan: research an exam and write a study plan
   * (maestro research/), kept as an HTML page plus any papers it checked. */
  kind: 'papers' | 'exam_plan';
  exam: string;
  years: number[];
  status: 'queued' | 'running' | 'done' | 'failed' | 'interrupted';
  report: string;
  found: ScoutPaper[];
  /** How many candidates failed the checks. */
  rejected: number;
};

export const isFinished = (job: ScoutJob) => job.status !== 'queued' && job.status !== 'running';

export async function scoutJobs(lane: Lane): Promise<ScoutJob[]> {
  const res = await authedFetch(lane, '/scout/jobs');
  if (res.status === 404) throw new Error('This Igris has no Scout. The Mac needs a current maestro.');
  if (!res.ok) throw new Error(`Could not check the scout (${res.status}).`);
  const body = (await res.json()) as { jobs?: ScoutJob[] };
  return body.jobs ?? [];
}

/** A job's study plan page (maestro research/job.py), as opposed to a paper. */
export const isPlan = (file: string) => file.endsWith('.html');

/**
 * Open a paper or a study plan in the browser, which saves or shows it. The link is fetched fresh at
 * the tap, because links expire and a card may have sat in the transcript for hours.
 * A link rather than an in-app viewer: showing a PDF inside the app needs a
 * FileProvider, which is native code and a new APK.
 */
export async function openPaper(lane: Lane, jobId: string, file: string): Promise<void> {
  const job = (await scoutJobs(lane)).find((j) => j.id === jobId);
  const paper = job?.found.find((p) => p.file === file);
  if (!paper) throw new Error('That file is no longer on the Mac.');
  await Linking.openURL(`${urlFor(lane)}${paper.link}`);
}

/** Where the history keeps which job a report belongs to (maestro scout/jobs.py appends it). */
const SCOUT_MARKER = /\n*\[scout:([0-9a-f]{12})\]\s*$/;

/** Split a saved answer into its words and the Scout job it reports, if any. */
export function splitScout(answer: string): { text: string; scout: string | null } {
  const match = SCOUT_MARKER.exec(answer);
  if (!match) return { text: answer, scout: null };
  return { text: answer.slice(0, match.index), scout: match[1] };
}

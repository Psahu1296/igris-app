import type { DeviceStep } from '@/lib/device';
import type { BillCard, Drawn, Lane, Phase, QuizCard } from '@/lib/maestro';

/** One ask and everything Igris did about it — what a Turn card draws. */
export type TurnState = {
  id: string;
  ask: string;
  answer: string | null;
  /** maestro's own words for the graph node currently running. */
  status: string | null;
  /** Which kind of work that node is — drives the loader. Null once settled. */
  phase: Phase | null;
  error: string | null;
  lane: Lane;
  elapsedMs: number | null;
  /** Something Igris did on this phone during the turn, and whether it worked. */
  device: DeviceStep | null;
  /** A tutor multiple-choice question asked in this turn. */
  quiz?: QuizCard | null;
  /** The photo sent with this ask (a local URI). Not restored from history. */
  photo?: string | null;
  /** A bill Igris read from that photo. */
  bill?: BillCard | null;
  /** A picture Igris drew in this turn. */
  drawn?: Drawn | null;
  /** The ask was an emergency: the SOS card, answered on the phone (lib/emergency.ts). */
  sos?: boolean;
};

/** A turn with nothing happened yet; callers override what they know. */
export const blankTurn = (id: string, ask: string, lane: Lane, change: Partial<TurnState> = {}): TurnState => ({
  id,
  ask,
  answer: null,
  status: null,
  phase: null,
  error: null,
  lane,
  elapsedMs: null,
  device: null,
  ...change,
});

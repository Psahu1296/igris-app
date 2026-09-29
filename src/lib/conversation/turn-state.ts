import type { DeviceStep } from '@/lib/device';
import type { BillCard, DrawProgress, Drawn, Lane, Phase, QuizCard } from '@/lib/maestro';

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
  /** How far the picture being drawn is; shown under the status until the answer. */
  progress?: DrawProgress | null;
  /** The ask was an emergency: the SOS card, answered on the phone (lib/emergency.ts). */
  sos?: boolean;
  /**
   * A Scout job (lib/scout.ts). On the turn that started it, the job being watched; on a
   * report turn (no ask, added when the job ends), the job whose papers the card shows.
   */
  scout?: string | null;
  /** This turn is a Scout report that arrived by itself: no ask, so no bubble of yours. */
  report?: boolean;
  /** Hint mode (lib/hint.ts): how many $$ steps of the answer are showing; unset = all. */
  reveal?: number | null;
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

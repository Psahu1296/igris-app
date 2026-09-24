import type { Lane } from '@/lib/config';
import { authedFetch } from '@/lib/maestro';

/**
 * The daily tutor's scoreboard (maestro GET /tutor/progress). Sessions themselves are
 * ordinary chat turns — this is only the view of how they are going.
 */
export type TopicScore = { id: string; title: string; score: number; cards: number; due: number };

export type TutorProgress = { taught: number; total: number; topics: TopicScore[] };

export async function tutorProgress(lane: Lane): Promise<TutorProgress | null> {
  const res = await authedFetch(lane, '/tutor/progress');
  // An older maestro has no tutor; the list screen simply leaves the section out.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Loading tutor progress failed (${res.status}).`);
  return (await res.json()) as TutorProgress;
}

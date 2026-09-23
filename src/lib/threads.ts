import type { Lane } from '@/lib/config';
import { authedFetch } from '@/lib/maestro';

/**
 * Conversations, as the sidebar sees them.
 *
 * History lives in maestro's Postgres, not on the phone, and that is the point:
 * the same thread is reachable from the Mac's voice loop, the Alexa skill and
 * here, so a conversation started on one surface continues on another. Storing it
 * locally would have given each device its own private, diverging idea of what was
 * said.
 */

export type ThreadSummary = {
  thread_id: string;
  /** The thread's first question, which is the closest thing to a title we have. */
  title: string;
  turns: number;
  last_at: string | null;
  started_at: string | null;
};

export type ThreadMessage = {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export async function listThreads(lane: Lane): Promise<ThreadSummary[]> {
  const res = await authedFetch(lane, '/threads');
  if (res.status === 404) throw new Error('This Igris is too old to list conversations.');
  if (!res.ok) throw new Error(`Could not load conversations (${res.status}).`);
  const body = (await res.json()) as { threads?: ThreadSummary[] };
  return body.threads ?? [];
}

export async function threadMessages(lane: Lane, threadId: string): Promise<ThreadMessage[]> {
  const res = await authedFetch(lane, `/threads/${encodeURIComponent(threadId)}`);
  if (!res.ok) throw new Error(`Could not open that conversation (${res.status}).`);
  const body = (await res.json()) as { messages?: ThreadMessage[] };
  return body.messages ?? [];
}

export async function deleteThread(lane: Lane, threadId: string): Promise<void> {
  const res = await authedFetch(lane, `/threads/${encodeURIComponent(threadId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Could not delete that conversation (${res.status}).`);
}

/**
 * A new thread id.
 *
 * Readable on purpose — these become thread_id in Postgres, where they sit beside
 * hand-named threads like "voice-v2" and "alexa". A bare UUID would make the table
 * unreadable at exactly the moment you are trying to debug which surface said what.
 */
export function newThreadId(): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  return `phone-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Lane } from '@/lib/config';
import {
  confirmRooms,
  correctPlan,
  getPlan,
  isBusy,
  myPlans,
  planPage,
  sharePlan,
  startPlan,
  type NewPhoto,
  type RenovationPlan,
  type Room,
} from '@/lib/renovate';

/** How often a running plan is checked. The reading takes ~20–30 s, planning 1–2 min,
 * the after pictures a minute or two each: a few seconds is plenty and costs nothing. */
const POLL_MS = 4000;

/**
 * The renovation screen's behaviour: his plans, the one being worked on, polling it while
 * the Mac reads or plans, and his actions (start, confirm the rooms, open, share, correct).
 */
export function useRenovation(lane: Lane) {
  const [plans, setPlans] = useState<RenovationPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The plan page being shown, as HTML; null when closed. */
  const [page, setPage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const replace = (plan: RenovationPlan) =>
    setPlans((list) => [plan, ...list.filter((p) => p.id !== plan.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));

  const refresh = useCallback(async () => {
    try {
      setPlans(await myPlans(lane));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [lane]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Poll the newest plan while the Mac is still working on it.
  const running = plans.find(isBusy);
  useEffect(() => {
    if (!running) return;
    timer.current = setTimeout(() => {
      getPlan(lane, running.id)
        .then(replace)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    }, POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [lane, running]);

  const act = async (work: () => Promise<RenovationPlan>) => {
    setBusy(true);
    setError(null);
    try {
      replace(await work());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    plans,
    loading,
    busy,
    error,
    refresh,
    start: (message: string, sketch: string, photos: NewPhoto[]) => act(() => startPlan(lane, message, sketch, photos)),
    confirm: (id: string, rooms: Room[]) => act(() => confirmRooms(lane, id, rooms)),
    page,
    open: (id: string) =>
      planPage(lane, id)
        .then(setPage)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))),
    close: () => setPage(null),
    share: (id: string) =>
      sharePlan(lane, id).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))),
    correct: (id: string, rooms: Room[], note: string) => act(() => correctPlan(lane, id, note, rooms)),
  };
}

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Answer, Meta } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space, Type } from '@/constants/theme';
import type { Lane } from '@/lib/config';
import { deleteThread, listThreads, type ThreadSummary } from '@/lib/threads';

/**
 * The conversation list.
 *
 * Reads from maestro, not the phone, so the threads here are the same ones the
 * Mac's voice loop and the Alexa skill write to — "voice-v2" and "alexa" show up
 * beside anything started on the phone. That is intentional: one Igris, many
 * surfaces, one memory.
 */
export function Sessions({
  visible,
  lane,
  currentId,
  onOpen,
  onNew,
  onClose,
}: {
  visible: boolean;
  lane: Lane;
  currentId: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Nothing sets state before the first await: doing so runs synchronously inside
  // the effect below and cascades a render before this one has finished.
  const load = useCallback(async () => {
    try {
      const rows = await listThreads(lane);
      setThreads(rows);
      setProblem(null);
    } catch (err) {
      setThreads([]);
      setProblem(err instanceof Error ? err.message : 'Could not load conversations.');
    }
  }, [lane]);

  useEffect(() => {
    // Same sanctioned-effect/over-fire as src/lib/assets/use-assets.ts: the rule
    // flags any call that transitively sets state, ignoring the await in between.
    // Every setState in `load` happens after it, so nothing cascades.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (visible) void load();
  }, [visible, load]);

  const remove = useCallback(
    async (id: string) => {
      // Optimistic: the row is gone from the list before the round trip, because
      // the alternative is a list that sits still after you tap delete.
      setThreads((prev) => prev?.filter((t) => t.thread_id !== id) ?? null);
      try {
        await deleteThread(lane, id);
      } catch {
        void load(); // put it back if maestro disagreed
      }
    },
    [lane, load]
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Answer style={styles.heading}>Conversations</Answer>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Meta>Close</Meta>
          </Pressable>
        </View>

        <Pressable
          onPress={onNew}
          accessibilityRole="button"
          style={[styles.newButton, { borderColor: laneColor(lane) }]}>
          <Text style={[styles.newLabel, { color: laneColor(lane) }]}>+ New conversation</Text>
        </Pressable>

        {threads === null ? (
          <ActivityIndicator style={styles.loading} color={Palette.muted} />
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {problem ? <Meta style={styles.problem}>{problem}</Meta> : null}
            {threads.length === 0 && !problem ? (
              <Meta style={styles.problem}>No conversations yet.</Meta>
            ) : null}

            {threads.map((thread) => {
              const active = thread.thread_id === currentId;
              return (
                <Pressable
                  key={thread.thread_id}
                  onPress={() => onOpen(thread.thread_id)}
                  onLongPress={() => void remove(thread.thread_id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityHint="Long press to delete this conversation"
                  style={[
                    styles.row,
                    {
                      borderColor: active ? laneColor(lane) : Palette.hairline,
                      backgroundColor: active ? Palette.surfaceLift : Palette.surfaceGlass,
                    },
                  ]}>
                  <Answer style={styles.title} numberOfLines={2}>
                    {thread.title}
                  </Answer>
                  <Meta style={styles.sub}>
                    {thread.turns} {thread.turns === 1 ? 'turn' : 'turns'}
                    {thread.last_at ? ` · ${when(thread.last_at)}` : ''}
                  </Meta>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

/** Relative time, because "3h ago" is read faster than a timestamp. */
function when(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
    paddingTop: Space.sm,
    paddingBottom: Space.lg,
  },
  heading: { color: Palette.text },
  newButton: {
    marginHorizontal: Gutter,
    marginBottom: Space.lg,
    paddingVertical: Space.md,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  newLabel: { fontFamily: Font.uiMedium, ...Type.small, letterSpacing: 0.5 },
  loading: { marginTop: Space.xxl },
  list: { paddingHorizontal: Gutter, paddingBottom: Space.xxl, gap: Space.md },
  row: { padding: Space.lg, borderRadius: 14, borderWidth: 1, gap: Space.xs },
  title: { color: Palette.text },
  sub: { marginTop: Space.xs },
  problem: { color: Palette.muted, paddingVertical: Space.lg },
});

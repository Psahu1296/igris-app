import * as Haptics from 'expo-haptics';
import {
  Clock,
  MessageCircle,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { Answer, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space, Type } from '@/constants/theme';
import type { Lane } from '@/lib/config';
import { deleteThread, listThreads, type ThreadSummary } from '@/lib/threads';
import { useSession } from '@/state/session';

/**
 * The conversation sidebar list / drawer.
 *
 * Reads from maestro, not the phone, so the threads here are the same ones the
 * Mac's voice loop and the Alexa skill write to — "voice-v2" and "alexa" show up
 * beside anything started on the phone.
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
  const [query, setQuery] = useState('');
  // `lane` is which server holds these threads; the accent is the mode — see Tint.
  const { lanePref } = useSession();
  const accent = laneColor(lanePref);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (visible) void load();
  }, [visible, load]);

  const remove = useCallback(
    async (id: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setThreads((prev) => prev?.filter((t) => t.thread_id !== id) ?? null);
      try {
        await deleteThread(lane, id);
      } catch {
        void load();
      }
    },
    [lane, load]
  );

  const filteredThreads = useMemo(() => {
    if (!threads) return [];
    if (!query.trim()) return threads;
    const q = query.toLowerCase();
    return threads.filter(
      (t) => t.title.toLowerCase().includes(q) || t.thread_id.toLowerCase().includes(q)
    );
  }, [threads, query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.modalBackdrop}>
        <SafeAreaView style={styles.drawerContainer} edges={['top', 'bottom']}>
          {/* Drawer Top Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <MessageSquare size={20} color={accent} />
              <Title style={styles.heading}>Conversations</Title>
            </View>
            <PressableScale
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onClose();
              }}
              hitSlop={12}
              accessibilityRole="button"
              style={styles.closeButton}>
              <X size={18} color={Palette.text} />
            </PressableScale>
          </View>

          {/* "+ New Conversation" Hero Action Button */}
          <View style={styles.actionWrapper}>
            <PressableScale
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onNew();
              }}
              accessibilityRole="button"
              style={[styles.newButton, { backgroundColor: accent, shadowColor: accent }]}>
              <Plus size={18} color={Palette.ground} />
              <Text style={styles.newLabel}>New Conversation</Text>
            </PressableScale>
          </View>

          {/* Quick Search Input Bar */}
          <View style={styles.searchWrapper}>
            <View style={styles.searchBar}>
              <Search size={16} color={Palette.faint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search conversations..."
                placeholderTextColor={Palette.faint}
                style={styles.searchInput}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <X size={14} color={Palette.muted} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* Thread List Section */}
          {threads === null ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={accent} size="large" />
              <Meta style={styles.loadingText}>Fetching conversations from maestro…</Meta>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.list} keyboardDismissMode="on-drag">
              {problem ? <Meta style={styles.problem}>{problem}</Meta> : null}
              {filteredThreads.length === 0 && !problem ? (
                <View style={styles.emptyBox}>
                  <Sparkles size={24} color={Palette.faint} />
                  <Meta style={styles.emptyText}>
                    {query ? 'No matching conversations found' : 'No past conversations yet.'}
                  </Meta>
                </View>
              ) : null}

              {filteredThreads.map((thread) => {
                const active = thread.thread_id === currentId;
                return (
                  <Animated.View key={thread.thread_id} entering={FadeInRight} exiting={FadeOutLeft}>
                    <PressableScale
                      onPress={() => {
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onOpen(thread.thread_id);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[
                        styles.row,
                        {
                          borderColor: active ? accent : Palette.hairline,
                          backgroundColor: active ? Palette.surfaceLift : Palette.surfaceGlass,
                          shadowColor: active ? accent : 'transparent',
                        },
                      ]}>
                      {/* Active Indicator Spine */}
                      <View
                        style={[
                          styles.rowSpine,
                          { backgroundColor: active ? accent : Palette.hairline },
                        ]}
                      />

                      <View style={styles.rowMain}>
                        <View style={styles.rowHeader}>
                          <Answer style={styles.title} numberOfLines={1}>
                            {thread.title}
                          </Answer>
                          {active ? (
                            <View style={[styles.activeBadge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
                              <Text style={[styles.activeBadgeText, { color: accent }]}>ACTIVE</Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={styles.rowMetaLine}>
                          <View style={styles.metaBadge}>
                            <MessageCircle size={11} color={Palette.muted} />
                            <Meta style={styles.metaBadgeText}>
                              {thread.turns} {thread.turns === 1 ? 'turn' : 'turns'}
                            </Meta>
                          </View>

                          {thread.last_at ? (
                            <View style={styles.metaBadge}>
                              <Clock size={11} color={Palette.muted} />
                              <Meta style={styles.metaBadgeText}>{when(thread.last_at)}</Meta>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      {/* Delete Button */}
                      <PressableScale
                        onPress={() => void remove(thread.thread_id)}
                        hitSlop={12}
                        haptic={Haptics.ImpactFeedbackStyle.Medium}
                        accessibilityRole="button"
                        accessibilityLabel="Delete conversation"
                        style={styles.deleteButton}>
                        <Trash2 size={15} color={Palette.faint} />
                      </PressableScale>
                    </PressableScale>
                  </Animated.View>
                );
              })}
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Relative time display */
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 4, 9, 0.88)',
    justifyContent: 'flex-end',
  },
  drawerContainer: {
    flex: 1,
    backgroundColor: Palette.ground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  heading: { color: Palette.text, fontSize: 20 },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Palette.surfaceLift,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  actionWrapper: {
    paddingHorizontal: Gutter,
    marginVertical: Space.sm,
  },
  newButton: {
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 4,
  },
  newLabel: {
    fontFamily: Font.uiMedium,
    color: Palette.ground,
    ...Type.ask,
  },
  searchWrapper: {
    paddingHorizontal: Gutter,
    marginBottom: Space.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    height: 40,
    borderRadius: 12,
    backgroundColor: Palette.surfaceLift,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  searchInput: {
    flex: 1,
    color: Palette.text,
    fontFamily: Font.ui,
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
  },
  loadingText: { color: Palette.muted },
  list: { paddingHorizontal: Gutter, paddingBottom: Space.xxl, gap: Space.md },
  emptyBox: {
    padding: Space.xxl,
    alignItems: 'center',
    gap: Space.md,
  },
  emptyText: { color: Palette.muted, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 2,
  },
  rowSpine: {
    width: 3,
    height: '100%',
  },
  rowMain: {
    flex: 1,
    padding: Space.md,
    gap: Space.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  title: { color: Palette.text, fontSize: 15, flex: 1 },
  activeBadge: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  activeBadgeText: {
    fontFamily: Font.uiMedium,
    fontSize: 8,
    letterSpacing: 0.8,
  },
  rowMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  metaBadgeText: {
    color: Palette.muted,
    fontSize: 11,
  },
  deleteButton: {
    padding: Space.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  problem: { color: Palette.muted, paddingVertical: Space.lg },
});

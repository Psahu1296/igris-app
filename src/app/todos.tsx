import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { AlertTriangle, Circle, ListTodo, Trash2, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { Answer, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space } from '@/constants/theme';
import {
  alarmAccess,
  clock,
  completeTodo,
  deleteTodo,
  describeDue,
  describeRecurrence,
  listTodos,
  openAlarmSettings,
  syncTodos,
  type Progress,
  type Todo,
} from '@/lib/todos';
import { tutorProgress, type TutorProgress } from '@/lib/tutor';
import type { TodoAlarmAccess } from '../../modules/igris-device';
import { useSession } from '@/state/session';

/**
 * The list, for glancing and quick fixes. Adding is done by talking to Igris ("remind
 * me at 7 to call the CA"), so there is no form here on purpose — the parser and its
 * read-back live in maestro, and a second way in would need both again.
 */
export default function Todos() {
  const { lane, lanePref } = useSession();
  const accent = laneColor(lanePref);
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [access, setAccess] = useState<TodoAlarmAccess | null>(null);
  const [tutor, setTutor] = useState<TutorProgress | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, progress] = await Promise.all([listTodos(lane), tutorProgress(lane).catch(() => null)]);
      setTodos(list);
      setTutor(progress);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your list.');
    }
  }, [lane]);

  // On every focus: coming back from Settings is how a missing permission gets fixed.
  useFocusEffect(
    useCallback(() => {
      setAccess(alarmAccess());
      void load();
    }, [load])
  );

  const act = async (todo: Todo, what: 'done' | 'delete') => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Optimistic: a slot marked done leaves the list at once; a failure puts it back.
    const before = todos;
    if (what === 'delete' || !todo.recurrence) setTodos((prev) => prev?.filter((t) => t.id !== todo.id) ?? prev);
    try {
      if (what === 'done') await completeTodo(lane, todo);
      else await deleteTodo(lane, todo);
      await Promise.all([load(), syncTodos(lane)]);
    } catch (err) {
      setTodos(before);
      setError(err instanceof Error ? err.message : 'That did not go through.');
    }
  };

  const sections = group(todos ?? []);
  const missing = access
    ? (Object.keys(ACCESS) as (keyof TodoAlarmAccess)[]).filter((k) => !access[k])
    : [];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <ListTodo size={20} color={accent} />
          <Title style={styles.headerTitle}>Todos</Title>
        </View>
        <PressableScale
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.backButton}>
          <X size={18} color={Palette.text} />
        </PressableScale>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={accent}
            colors={[accent]}
            progressBackgroundColor={Palette.surface}
            onRefresh={async () => {
              setRefreshing(true);
              await Promise.all([load(), syncTodos(lane).catch(() => 0)]);
              setRefreshing(false);
            }}
          />
        }>
        {missing.map((k) => (
          <PressableScale
            key={k}
            onPress={() => openAlarmSettings(k)}
            accessibilityRole="button"
            style={styles.warning}>
            <AlertTriangle size={16} color={Palette.local} />
            <View style={styles.who}>
              <Text style={styles.warningTitle}>{ACCESS[k].title}</Text>
              <Meta style={styles.warningText}>{ACCESS[k].text}</Meta>
            </View>
            <Meta style={[styles.link, { color: accent }]}>Allow</Meta>
          </PressableScale>
        ))}

        {error ? <Meta style={styles.error}>{error}</Meta> : null}

        {todos && todos.length === 0 ? (
          <Answer style={styles.lede}>
            {'Nothing on your list. Tell Igris: “remind me at 7 to call the CA”, or “add a todo to buy milk”.'}
          </Answer>
        ) : null}

        {tutor && tutor.topics.length > 0 ? <WeakTopics progress={tutor} accent={accent} /> : null}

        {sections.map(([title, items]) => (
          <View key={title} style={styles.section}>
            <Meta style={styles.sectionTitle}>{title}</Meta>
            {items.map((todo) => (
              <Row key={todo.id} todo={todo} accent={accent} onDone={() => void act(todo, 'done')} onDelete={() => void act(todo, 'delete')} />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const ACCESS: Record<keyof TodoAlarmAccess, { title: string; text: string }> = {
  notifications: { title: 'Notifications are off', text: 'Todos cannot poke you at all.' },
  fullScreen: { title: 'Alarm screen not allowed', text: 'Must-do todos cannot take over the lock screen.' },
  exactAlarms: { title: 'Exact alarms not allowed', text: 'Todos may ring minutes late.' },
};

function group(todos: Todo[]): [string, Todo[]][] {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const today: Todo[] = [];
  const upcoming: Todo[] = [];
  const repeating: Todo[] = [];
  const anytime: Todo[] = [];
  for (const t of todos) {
    if (t.recurrence) repeating.push(t);
    else if (!t.due_at) anytime.push(t);
    else if (new Date(t.due_at) <= endOfToday) today.push(t);
    else upcoming.push(t);
  }
  return (
    [
      ['TODAY', today],
      ['REPEATING', repeating],
      ['UPCOMING', upcoming],
      ['ANYTIME', anytime],
    ] as [string, Todo[]][]
  ).filter(([, items]) => items.length > 0);
}

const SLOT_WORD = { done: 'done', skipped: 'skipped', cleared: '', open: 'now', upcoming: '' } as const;

/** "9 AM skipped · 2 PM now · 8 PM" — where today's chances stand. */
function slotLine(p: Progress): string {
  return p.slots
    .map((s) => [clock(s.at), SLOT_WORD[s.state]].filter(Boolean).join(' '))
    .join(' · ');
}

/** Interview prep's weakest topics: each topic's average latest score out of 5. */
function WeakTopics({ progress, accent }: { progress: TutorProgress; accent: string }) {
  return (
    <View style={styles.section}>
      <Meta style={styles.sectionTitle}>{`WEAK TOPICS · ${progress.taught} OF ${progress.total} TAUGHT`}</Meta>
      {progress.topics.slice(0, 5).map((t) => (
        <View key={t.id} style={styles.topic}>
          <View style={styles.topicHead}>
            <Text style={styles.topicTitle} numberOfLines={1}>
              {t.title}
            </Text>
            <Meta style={styles.when}>{`${t.score.toFixed(1)} / 5${t.due ? ` · ${t.due} due` : ''}`}</Meta>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.bar,
                { width: `${(t.score / 5) * 100}%`, backgroundColor: t.score < 3 ? Palette.alert : accent },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function Row({
  todo,
  accent,
  onDone,
  onDelete,
}: {
  todo: Todo;
  accent: string;
  onDone: () => void;
  onDelete: () => void;
}) {
  const overdue = !todo.recurrence && todo.due_at !== null && new Date(todo.due_at) < new Date();
  const when = todo.recurrence
    ? describeRecurrence(todo.recurrence)
    : todo.due_at
      ? describeDue(todo.due_at)
      : null;
  const p = todo.progress;
  const tags = [
    p ? (p.today === 'done' ? 'Done today' : slotLine(p)) : null,
    todo.priority === 'must' ? 'Must-do' : todo.priority === 'high' ? 'High' : null,
    todo.done_on_ack ? 'Reminder' : null,
    todo.session ? 'Session' : null,
  ].filter(Boolean);

  return (
    <View style={styles.row}>
      <PressableScale
        onPress={onDone}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={todo.recurrence ? `Done for this slot: ${todo.title}` : `Done: ${todo.title}`}>
        <Circle size={22} color={todo.priority === 'must' ? Palette.alert : accent} />
      </PressableScale>
      <View style={styles.who}>
        <View style={styles.titleRow}>
          <Text style={styles.name}>{todo.title}</Text>
          {p && p.streak > 0 ? <Meta style={[styles.streak, { color: accent }]}>{`${p.streak}-day streak`}</Meta> : null}
        </View>
        {p?.missed_yesterday && p.today !== 'done' ? (
          <Meta style={styles.missed}>Missed yesterday — no skipping today</Meta>
        ) : null}
        {when || tags.length ? (
          <Meta style={[styles.when, overdue && { color: Palette.alert }]} numberOfLines={1}>
            {[when, ...tags].filter(Boolean).join(' · ')}
          </Meta>
        ) : null}
      </View>
      <PressableScale
        onPress={onDelete}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${todo.title}`}
        style={styles.remove}>
        <Trash2 size={16} color={Palette.faint} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  headerTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  headerTitle: { fontSize: 22 },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Palette.surfaceLift,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  content: { paddingHorizontal: Gutter, paddingTop: Space.lg, paddingBottom: Space.xl, gap: Space.xl },
  lede: { color: Palette.muted, fontSize: 15, lineHeight: 22 },
  section: { gap: Space.xs },
  sectionTitle: { fontSize: 10, letterSpacing: 1.2, color: Palette.faint, marginBottom: Space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: 12,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  who: { flex: 1, gap: 2 },
  name: { fontFamily: Font.voiceMedium, color: Palette.text, fontSize: 16, flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  streak: { fontFamily: Font.uiMedium, fontSize: 11 },
  missed: { color: Palette.alert, fontSize: 12 },
  when: { color: Palette.muted, fontSize: 12 },
  remove: { padding: Space.xs },
  topic: { gap: 6, paddingVertical: Space.xs },
  topicHead: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  topicTitle: { flex: 1, fontFamily: Font.ui, color: Palette.text, fontSize: 14 },
  track: { height: 4, borderRadius: 2, backgroundColor: Palette.surfaceLift, overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2 },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: 12,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.local + '55',
  },
  warningTitle: { fontFamily: Font.uiMedium, color: Palette.text, fontSize: 14 },
  warningText: { color: Palette.muted, fontSize: 12 },
  link: { fontFamily: Font.uiMedium, fontSize: 13 },
  error: { color: Palette.alert, fontSize: 13 },
});

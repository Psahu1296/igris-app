import * as Haptics from 'expo-haptics';
import { Check, Flame, Terminal, X } from 'lucide-react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Bar } from '@/components/habit-bar';
import { Markdown } from '@/components/markdown';
import { PressableScale } from '@/components/pressable-scale';
import { Meta, Title } from '@/components/typography';
import { Font, Gutter, Palette, Space } from '@/constants/theme';
import type { Lane } from '@/lib/config';
import { answerCard, nextCard, type Habit, type PyNext, type PyResult } from '@/lib/prep';

/**
 * Read-code cards, one at a time, forever (maestro prep/python.py). Built to pull him
 * back for "one more": the answer is instant, a run of right answers lights a combo and
 * earns more, and the next card is one tap away with the XP left to the daily goal on
 * the button. Celebrations fire once, on the answer that earned them.
 */

type Party = { emoji: string; title: string; line: string };

export function PythonPractice({
  lane,
  accent,
  habit: initial,
  onClose,
}: {
  lane: Lane;
  accent: string;
  habit: Habit | null;
  onClose: (habit: Habit | null) => void;
}) {
  const [next, setNext] = useState<PyNext | null>(null);
  const [ahead, setAhead] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [result, setResult] = useState<PyResult | null>(null);
  const [habit, setHabit] = useState<Habit | null>(initial);
  const [combo, setCombo] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [party, setParty] = useState<Party | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (wantAhead: boolean, after: string | null) => {
      try {
        setNext(await nextCard(lane, wantAhead, after));
        setChosen(null);
        setResult(null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load a card.');
      }
    },
    [lane]
  );

  // The first card only: coming back to the app must not swap the card being read.
  const started = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (started.current) return;
      started.current = true;
      void load(false, null);
    }, [load])
  );

  const card = next?.card ?? null;

  const choose = async (i: number) => {
    if (!card || chosen !== null) return;
    setChosen(i);
    try {
      const r = await answerCard(lane, card.id, i);
      setResult(r);
      setHabit(r.habit);
      setAnswered((n) => n + 1);
      setCombo((c) => (r.right ? c + 1 : 0));
      void Haptics.notificationAsync(
        r.right ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
      const p: Party | null = r.rank_up
        ? { emoji: '🏆', title: `Promoted: ${r.habit.rank}`, line: `Level ${r.habit.level}. Next stop: ${r.habit.next ?? 'the top'}.` }
        : r.streak_up
          ? {
              emoji: '🔥',
              title: `${r.habit.streak}-day streak`,
              line: r.habit.streak === 1 ? 'Day one. Come back tomorrow and it grows.' : 'Lit for today. Keep the chain going.',
            }
          : r.goal_hit
            ? { emoji: '🎯', title: 'Daily goal hit', line: 'Everything from here is bonus XP.' }
            : null;
      if (p) setTimeout(() => setParty(p), 450);
    } catch (err) {
      setChosen(null);
      setError(err instanceof Error ? err.message : 'That did not go through.');
    }
  };

  const toGoal = habit ? Math.max(0, habit.goal - habit.today_xp) : 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Terminal size={20} color={accent} />
          <Title style={styles.title}>Python</Title>
        </View>
        <View style={styles.headerRight}>
          {combo >= 2 ? (
            <Animated.View key={combo} entering={ZoomIn.springify()} style={styles.combo}>
              <Flame size={14} color={Palette.local} fill={Palette.local} />
              <Text style={styles.comboText}>{`×${combo}`}</Text>
            </Animated.View>
          ) : null}
          {habit ? (
            <View style={styles.streakChip}>
              <Flame size={14} color={habit.done_today ? Palette.local : Palette.faint} />
              <Text style={styles.streakText}>{habit.streak}</Text>
            </View>
          ) : null}
          <PressableScale
            onPress={() => onClose(habit)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.close}>
            <X size={18} color={Palette.text} />
          </PressableScale>
        </View>
      </View>
      {habit ? (
        <View style={styles.goalStrip}>
          <Bar value={habit.today_xp / habit.goal} color={toGoal === 0 ? Palette.auto : Palette.local} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Meta style={styles.error}>{error}</Meta> : null}
        {!next ? (
          <ActivityIndicator color={accent} />
        ) : !card ? (
          <View style={styles.locked}>
            <Text style={styles.lockedTitle}>Cards unlock with your katas</Text>
            <Meta style={styles.muted}>
              {`Each card opens on the day its kata is in the plan (K1 on Mon 26 Oct). ${next.mastery.total} cards in the deck.`}
            </Meta>
            <PressableScale
              onPress={() => {
                setAhead(true);
                void load(true, null);
              }}
              style={[styles.primary, { backgroundColor: accent }]}>
              <Text style={styles.primaryText}>Practise ahead anyway</Text>
            </PressableScale>
          </View>
        ) : (
          <Animated.View key={`${card.id}-${answered}`} entering={FadeIn.duration(220)} style={styles.cardBody}>
            <View style={styles.meta}>
              <Meta style={styles.label}>{`K${card.kata} · ${card.kind.toUpperCase()}`}</Meta>
              <Meta style={styles.muted}>
                {`${next.mastery.solid} of ${next.mastery.total} solid${ahead ? ' · ahead' : ''}`}
              </Meta>
            </View>
            <Text style={styles.ask}>{card.ask}</Text>
            <CodeBlock code={card.code} />

            <View style={styles.options}>
              {card.options.map((o) => {
                const isRight = result && o.i === 0;
                const isWrongPick = result && chosen === o.i && o.i !== 0;
                return (
                  <PressableScale
                    key={o.i}
                    onPress={() => void choose(o.i)}
                    disabled={chosen !== null}
                    accessibilityRole="button"
                    style={[
                      styles.option,
                      chosen === o.i && !result && { borderColor: accent },
                      isRight && { borderColor: Palette.auto, backgroundColor: Palette.autoSoft },
                      isWrongPick && { borderColor: Palette.alert },
                      result && !isRight && !isWrongPick && styles.dim,
                    ]}>
                    <Text style={[styles.optionText, card.kind !== 'bug' && styles.mono]}>{o.text}</Text>
                    {isRight ? <Check size={18} color={Palette.auto} /> : null}
                    {isWrongPick ? <X size={18} color={Palette.alert} /> : null}
                  </PressableScale>
                );
              })}
            </View>

            {result ? (
              <Animated.View entering={FadeInUp.springify()} style={styles.result}>
                <View style={styles.verdictRow}>
                  <Text style={[styles.verdict, { color: result.right ? Palette.auto : Palette.alert }]}>
                    {result.right ? (combo >= 3 ? `Right · ${combo} in a row` : 'Right') : 'Not quite'}
                  </Text>
                  <Animated.Text entering={ZoomIn.springify()} style={styles.xp}>{`+${result.xp} XP`}</Animated.Text>
                </View>
                <Markdown text={result.why} accent={accent} />
                {result.fixed ? (
                  <>
                    <Meta style={styles.label}>FIXED</Meta>
                    <CodeBlock code={result.fixed} />
                  </>
                ) : null}
                <PressableScale
                  onPress={() => void load(ahead, card.id)}
                  style={[styles.primary, { backgroundColor: accent }]}>
                  <Text style={styles.primaryText}>
                    {toGoal > 0 ? `Next card · ${toGoal} XP to goal` : 'One more card'}
                  </Text>
                </PressableScale>
              </Animated.View>
            ) : null}
          </Animated.View>
        )}
      </ScrollView>

      {party ? (
        <PressableScale onPress={() => setParty(null)} style={styles.partyBackdrop} accessibilityLabel="Dismiss">
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.party, { borderColor: accent }]}>
            <Text style={styles.partyEmoji}>{party.emoji}</Text>
            <Text style={styles.partyTitle}>{party.title}</Text>
            <Meta style={styles.partyLine}>{party.line}</Meta>
            <Meta style={styles.muted}>Tap to keep going</Meta>
          </Animated.View>
        </PressableScale>
      ) : null}
    </SafeAreaView>
  );
}

/** Code with line numbers, scrolling sideways rather than wrapping: wrapped Python lies about indentation. */
function CodeBlock({ code }: { code: string }) {
  const lines = code.split('\n');
  return (
    <ScrollView horizontal style={styles.code} contentContainerStyle={styles.codeInner}>
      <View>
        {lines.map((line, n) => (
          <View key={n} style={styles.codeLine}>
            <Text style={styles.lineNo}>{String(n + 1).padStart(2, ' ')}</Text>
            <Text style={styles.codeText}>{line || ' '}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
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
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  title: { fontSize: 22 },
  combo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Space.sm,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Palette.localSoft,
  },
  comboText: { fontFamily: Font.uiMedium, color: Palette.local, fontSize: 13 },
  streakChip: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  streakText: { fontFamily: Font.uiMedium, color: Palette.text, fontSize: 14 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Palette.surfaceLift,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  goalStrip: { paddingHorizontal: Gutter, paddingBottom: Space.sm },
  content: { paddingHorizontal: Gutter, paddingTop: Space.md, paddingBottom: Space.huge, gap: Space.lg },
  error: { color: Palette.alert, fontSize: 13 },
  muted: { color: Palette.muted, fontSize: 12 },
  label: { fontSize: 10, letterSpacing: 1.2, color: Palette.faint },
  locked: { gap: Space.md, paddingTop: Space.xl },
  lockedTitle: { fontFamily: Font.voiceMedium, color: Palette.text, fontSize: 22 },
  cardBody: { gap: Space.md },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ask: { fontFamily: Font.voiceMedium, color: Palette.text, fontSize: 20, lineHeight: 26 },
  code: { borderRadius: 12, backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.hairline },
  codeInner: { padding: Space.md },
  codeLine: { flexDirection: 'row', gap: Space.md },
  lineNo: { fontFamily: 'monospace', fontSize: 13, lineHeight: 20, color: Palette.faint },
  codeText: { fontFamily: 'monospace', fontSize: 13, lineHeight: 20, color: Palette.text },
  options: { gap: Space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.md,
    borderRadius: 12,
    backgroundColor: Palette.surface,
    borderWidth: 1.5,
    borderColor: Palette.hairline,
  },
  optionText: { flex: 1, fontFamily: Font.ui, color: Palette.text, fontSize: 14, lineHeight: 20 },
  mono: { fontFamily: 'monospace', fontSize: 13 },
  dim: { opacity: 0.45 },
  result: { gap: Space.md },
  verdictRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  verdict: { fontFamily: Font.voiceMedium, fontSize: 24 },
  xp: { fontFamily: Font.uiMedium, color: Palette.local, fontSize: 18 },
  primary: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Space.lg },
  primaryText: { fontFamily: Font.uiMedium, color: Palette.ground, fontSize: 15 },
  partyBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(9, 8, 14, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Gutter,
  },
  party: {
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.xl,
    borderRadius: 20,
    backgroundColor: Palette.surface,
    borderWidth: 1.5,
    width: '100%',
  },
  partyEmoji: { fontSize: 64 },
  partyTitle: { fontFamily: Font.voiceMedium, color: Palette.text, fontSize: 26, textAlign: 'center' },
  partyLine: { color: Palette.muted, fontSize: 14, textAlign: 'center' },
});

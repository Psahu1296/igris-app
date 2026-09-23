import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiCore } from '@/components/ai-core';
import { Composer } from '@/components/composer';
import { LaneBadge } from '@/components/lane-badge';
import { Turn, type TurnState } from '@/components/turn';
import { Answer, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space, Type } from '@/constants/theme';
import type { Lane } from '@/lib/config';
import { AuthError, streamChat } from '@/lib/maestro';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import { useSpeech } from '@/lib/voice/use-speech';
import { useSession } from '@/state/session';

/** Real questions, not feature advertisements — tapping one asks it. */
const OPENERS = [
  { icon: '📊', text: "what's today's revenue" },
  { icon: '💳', text: 'who owes money' },
  { icon: '⛅', text: 'weather in indore' },
];

export default function Transcript() {
  const { lane, probing, refreshLane, signOut } = useSession();
  const speech = useSpeech();
  const [turns, setTurns] = useState<TurnState[]>([]);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const bottomInset = useKeyboardInset();

  const ask = useCallback(
    async (message: string) => {
      const id = `${Date.now()}`;
      const startedAt = Date.now();

      setTurns((prev) => [
        ...prev,
        {
          id,
          ask: message,
          answer: null,
          status: 'Igris is thinking…',
          error: null,
          lane,
          elapsedMs: null,
        },
      ]);
      setBusy(true);
      void speech.stop(); // a new question interrupts the old answer

      const patch = (change: Partial<TurnState>) =>
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...change } : t)));

      try {
        let answered = false;
        await streamChat({
          lane,
          message,
          onEvent: (event) => {
            if (event.kind === 'answer') {
              answered = true;
              patch({ answer: event.message, status: null, elapsedMs: Date.now() - startedAt });
              void speech.speak(event.message);
            } else {
              patch({ status: event.message });
            }
          },
        });
        // maestro closed the stream without ever emitting a `response`. Say so
        // rather than leaving a turn stuck on "thinking" forever.
        if (!answered) {
          patch({ status: null, error: 'Igris closed the connection without answering.' });
        }
      } catch (err) {
        patch({
          status: null,
          error:
            err instanceof AuthError
              ? 'Your session ended. Sign out and back in.'
              : err instanceof Error
                ? err.message
                : 'Could not reach Igris.',
        });
      } finally {
        setBusy(false);
      }
    },
    [lane, speech]
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={[styles.fill, { paddingBottom: bottomInset }]}>
        {/* Futuristic Top Bar */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Title style={styles.headerTitle}>Igris</Title>
            <View style={[styles.statusDot, { backgroundColor: laneColor(lane) }]} />
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/voice');
              }}
              hitSlop={12}
              accessibilityRole="button"
              style={styles.voicePill}>
              <Text style={styles.voicePillIcon}>🎙️</Text>
              <Meta style={styles.voicePillText}>Voice</Meta>
            </Pressable>
            <LaneBadge lane={lane} probing={probing} onPress={() => void refreshLane()} />
          </View>
        </View>

        <ScrollView
          ref={scroller}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
          keyboardDismissMode="on-drag">
          {turns.length === 0 ? (
            <Empty lane={lane} busy={busy} onPick={ask} onSignOut={() => void signOut()} />
          ) : (
            turns.map((turn) => <Turn key={turn.id} turn={turn} />)
          )}
        </ScrollView>

        <Composer lane={lane} busy={busy} onSend={(m) => void ask(m)} />
      </View>
    </SafeAreaView>
  );
}

function Empty({
  lane,
  busy,
  onPick,
  onSignOut,
}: {
  lane: Lane;
  busy: boolean;
  onPick: (message: string) => void;
  onSignOut: () => void;
}) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyContainer}>
      {/* Central Interactive AI Core */}
      <View style={styles.coreWrapper}>
        <AiCore lane={lane} mode={busy ? 'thinking' : 'idle'} size={110} />
      </View>

      <Answer style={styles.emptyLede}>
        {lane === 'local'
          ? 'Connected to the Mac. All system tools active.'
          : 'Operating via Render Cloud. System tools limited, answers may take ~30s.'}
      </Answer>

      {/* Suggested Quick Openers */}
      <View style={styles.openersSection}>
        <Meta style={styles.openersTitle}>QUICK COMMANDS</Meta>
        <View style={styles.openersGrid}>
          {OPENERS.map((opener, idx) => (
            <Animated.View
              key={opener.text}
              entering={FadeInDown.delay(100 * idx).springify()}>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onPick(opener.text);
                }}
                accessibilityRole="button"
                style={styles.openerCard}>
                <Text style={styles.openerIcon}>{opener.icon}</Text>
                <Text style={styles.openerText}>{opener.text}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </View>

      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSignOut();
        }}
        accessibilityRole="button"
        style={styles.signOutButton}>
        <Meta style={styles.signOutText}>Sign out session</Meta>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  fill: { flex: 1 },
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
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  headerTitle: {
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    fontSize: 24,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  voicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs,
    borderRadius: 12,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  voicePillIcon: { fontSize: 12 },
  voicePillText: { color: Palette.text, fontFamily: Font.uiMedium, fontSize: 11 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: Space.md, paddingBottom: Space.xl },
  emptyContainer: {
    paddingHorizontal: Gutter,
    alignItems: 'center',
    paddingTop: Space.xl,
    gap: Space.xl,
  },
  coreWrapper: {
    marginVertical: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLede: {
    color: Palette.muted,
    textAlign: 'center',
    maxWidth: 340,
    fontSize: 16,
    lineHeight: 24,
  },
  openersSection: {
    width: '100%',
    gap: Space.sm,
    marginTop: Space.md,
  },
  openersTitle: {
    fontSize: 10,
    letterSpacing: 1.2,
    color: Palette.faint,
    textAlign: 'center',
  },
  openersGrid: {
    gap: Space.sm,
  },
  openerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: 14,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  openerIcon: {
    fontSize: 16,
  },
  openerText: {
    fontFamily: Font.ui,
    color: Palette.text,
    ...Type.ask,
  },
  signOutButton: {
    marginTop: Space.lg,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
  },
  signOutText: {
    color: Palette.faint,
  },
});


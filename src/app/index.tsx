import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Composer } from '@/components/composer';
import { LaneBadge } from '@/components/lane-badge';
import { Turn, type TurnState } from '@/components/turn';
import { Answer, Ask, Meta, Title } from '@/components/typography';
import { Gutter, Palette, Space } from '@/constants/theme';
import type { Lane } from '@/lib/config';
import { AuthError, streamChat } from '@/lib/maestro';
import { useSpeech } from '@/lib/voice/use-speech';
import { useSession } from '@/state/session';

/** Real questions, not feature advertisements — tapping one asks it. */
const OPENERS = ["what's today's revenue", 'who owes money', 'weather in indore'];

export default function Transcript() {
  const { lane, probing, refreshLane, signOut } = useSession();
  const speech = useSpeech();
  const [turns, setTurns] = useState<TurnState[]>([]);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollView>(null);

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
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Title>Igris</Title>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push('/voice')} hitSlop={12} accessibilityRole="button">
            <Meta>Voice</Meta>
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
          <Empty lane={lane} onPick={ask} onSignOut={() => void signOut()} />
        ) : (
          turns.map((turn) => <Turn key={turn.id} turn={turn} />)
        )}
      </ScrollView>

      <Composer lane={lane} busy={busy} onSend={(m) => void ask(m)} />
    </SafeAreaView>
  );
}

function Empty({
  lane,
  onPick,
  onSignOut,
}: {
  lane: Lane;
  onPick: (message: string) => void;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Answer style={styles.emptyLede}>
        {lane === 'local'
          ? 'The Mac is awake. Everything is available.'
          : 'Answering from Render, so the dhaba is out of reach and the first reply takes about half a minute.'}
      </Answer>

      <View style={styles.openers}>
        {OPENERS.map((opener) => (
          <Pressable key={opener} onPress={() => onPick(opener)} accessibilityRole="button">
            <Ask style={styles.opener}>{opener}</Ask>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={onSignOut} accessibilityRole="button" style={styles.signOut}>
        <Meta>Sign out</Meta>
      </Pressable>
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
    paddingBottom: Space.lg,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: Space.sm, paddingBottom: Space.xl },
  empty: { paddingHorizontal: Gutter, gap: Space.xl },
  emptyLede: { color: Palette.muted, maxWidth: 420 },
  openers: { gap: Space.md },
  opener: { color: Palette.text },
  signOut: { marginTop: Space.xxl, alignSelf: 'flex-start' },
});

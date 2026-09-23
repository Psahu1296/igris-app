import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Answer, Aside, Meta } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space, Type } from '@/constants/theme';
import type { Lane } from '@/lib/maestro';

export type TurnState = {
  id: string;
  ask: string;
  answer: string | null;
  /** maestro's own words for the graph node currently running. */
  status: string | null;
  error: string | null;
  lane: Lane;
  elapsedMs: number | null;
};

export function Turn({ turn }: { turn: TurnState }) {
  const accent = laneColor(turn.lane);

  return (
    <Animated.View entering={FadeInUp.springify().damping(18)} style={styles.turnContainer}>
      {/* User Question Pill Header */}
      <View style={styles.userRow}>
        <View style={styles.userBadge}>
          <Text style={styles.userBadgeText}>YOU</Text>
        </View>
        <Text style={styles.askText}>{turn.ask}</Text>
      </View>

      {/* Glass Card Response Box */}
      <View style={[styles.card, { borderColor: Palette.hairline }]}>
        {/* Glowing Left Accent Spine */}
        <View style={[styles.spine, { backgroundColor: accent, shadowColor: accent }]} />

        <View style={styles.content}>
          {turn.answer ? <Answer style={styles.answerText}>{turn.answer}</Answer> : null}

          {!turn.answer && turn.status ? (
            <View style={styles.thinkingRow}>
              <View style={[styles.thinkingDot, { backgroundColor: Palette.thinking }]} />
              <Aside style={styles.statusText}>{turn.status}</Aside>
            </View>
          ) : null}

          {turn.error ? <Answer style={styles.errorText}>{turn.error}</Answer> : null}

          {/* Response Metadata Badge */}
          {turn.answer && turn.elapsedMs ? (
            <View style={styles.metaRow}>
              <View style={[styles.metaPill, { backgroundColor: Palette.surfaceLift }]}>
                <Meta style={[styles.metaText, { color: accent }]}>
                  {turn.lane === 'local' ? '⚡ ' : '☁️ '}
                  {`${(turn.elapsedMs / 1000).toFixed(1)}s via ${turn.lane === 'local' ? 'Mac' : 'Render'}`}
                </Meta>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  turnContainer: {
    marginBottom: Space.xl,
    paddingHorizontal: Gutter,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  userBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: Palette.surfaceLift,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
  },
  userBadgeText: {
    fontFamily: Font.uiMedium,
    color: Palette.muted,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  askText: {
    flex: 1,
    fontFamily: Font.ui,
    color: Palette.text,
    ...Type.ask,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Palette.surfaceGlass,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  spine: {
    width: 3,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  content: {
    flex: 1,
    padding: Space.lg,
    gap: Space.sm,
  },
  answerText: {
    color: Palette.text,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  thinkingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: Palette.muted,
  },
  errorText: {
    color: Palette.alert,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.xs,
  },
  metaPill: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: 3,
    borderRadius: 8,
  },
  metaText: {
    fontFamily: Font.uiMedium,
    fontSize: 10,
  },
});


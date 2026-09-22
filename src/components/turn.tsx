import { StyleSheet, View } from 'react-native';

import { Answer, Aside, Ask, Meta } from '@/components/typography';
import { Gutter, laneColor, Palette, Space } from '@/constants/theme';
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

/**
 * One exchange, as a transcript rather than a conversation.
 *
 * There are no bubbles: your question is small and quiet, Igris's answer is
 * full-measure serif behind a rule coloured by the lane that produced it. That
 * rule is the provenance — warm means the Mac answered with every tool available,
 * cold means Render answered without them.
 */
export function Turn({ turn }: { turn: TurnState }) {
  const rule = laneColor(turn.lane);

  return (
    <View style={styles.turn}>
      <Ask style={styles.ask}>{turn.ask}</Ask>

      <View style={styles.body}>
        <View style={[styles.rule, { backgroundColor: rule }]} />
        <View style={styles.content}>
          {turn.answer ? <Answer>{turn.answer}</Answer> : null}
          {!turn.answer && turn.status ? <Aside>{turn.status}</Aside> : null}
          {turn.error ? <Answer style={styles.error}>{turn.error}</Answer> : null}

          {/* Slow turns get named rather than hidden. A 38-second answer from
              Render is information about where Igris is, not a glitch. */}
          {turn.answer && turn.elapsedMs && turn.elapsedMs > 3000 ? (
            <Meta style={styles.meta}>{`took ${Math.round(turn.elapsedMs / 1000)}s`}</Meta>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  turn: { marginBottom: Space.xxl },
  ask: { marginBottom: Space.md, paddingLeft: Gutter },
  body: { flexDirection: 'row' },
  rule: { width: 2, borderRadius: 1, marginRight: Gutter - 2 },
  content: { flex: 1, paddingRight: Space.sm },
  error: { color: Palette.alert },
  meta: { marginTop: Space.md },
});

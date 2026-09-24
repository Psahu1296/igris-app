import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { laneMetal, phaseMetal, type Tint } from '@/constants/theme';
import { LOGO } from '@/lib/logo';

/**
 * The sigil as a status light for a turn in flight.
 *
 * ONE motion — a pen stroke circling the crown's outline over a dimmed body, with a
 * pulsing core — and the COLOUR says which step the turn is on:
 *
 *   thinking   violet  `status` / `classifying`
 *   working    pink    `agent_started` — an agent is running tools
 *   answering  the metal of the brain that answered (`tint`), while it is spoken
 *   idle       the icon, lit and still
 *
 * One motion rather than one per step, because the step that had its own motion
 * (segments running round the outline) read on the phone as something crawling.
 * Steps come from what maestro actually streams (lib/maestro.ts::phaseOf), so the
 * loader never claims progress the server has not reported.
 *
 * Idle must stay still: past turns sit in it, and a transcript of moving avatars is
 * noise that also burns the UI thread. Only a lone hero mark may `breathe`.
 *
 * "answering" has no duration in text: maestro sends the whole answer as one
 * `response` event at the end of the graph (main.py, on_chain_end), not as tokens.
 * So it is driven by speech playback, where it genuinely lasts.
 */

export type LoaderState = 'idle' | 'thinking' | 'working' | 'answering';

const L = LOGO.crown.length;

/**
 * The stroke is set in viewBox units (the box is 850 tall), so a fixed number would
 * vanish when small: 22 units is 0.7px at the 28px a turn card uses. Pick the width
 * on SCREEN instead — never under 1.5px, ~2.4px at hero size — and convert.
 */
const strokeFor = (size: number) => (Math.max(1.5, size * 0.022) * 850) / size;

/** One travelling stroke, about a quarter of the outline. */
const DASH = [L * 0.26, L * 0.74];

const LIT = { fill: 1, line: 0 };
const DIMMED = { fill: 0.18, line: 1 };

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function IgrisLoader({
  state,
  tint,
  size = 28,
  breathe = false,
}: {
  state: LoaderState;
  /** The brain's metal: used when idle and while answering. */
  tint: Tint;
  /** Height in px; width follows the mark's aspect. */
  size?: number;
  /** Let an idle mark breathe. For a lone hero mark only — never in a list. */
  breathe?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const active = state !== 'idle';
  const metal =
    state === 'thinking' || state === 'working' ? phaseMetal[state] : laneMetal(tint);
  // Ids are shared by every loader in the same colour, which is harmless: the
  // definitions are identical.
  const gradient = `igrisLoaderMetal-${state === 'thinking' || state === 'working' ? state : tint}`;

  const fill = useSharedValue(1);
  const line = useSharedValue(0);
  const run = useSharedValue(0); // 0 → 1 per lap of the outline
  const core = useSharedValue(1); // core opacity
  const scale = useSharedValue(1);

  useEffect(() => {
    const target = active ? DIMMED : LIT;
    fill.value = withTiming(target.fill, { duration: 320 });
    line.value = withTiming(target.line, { duration: 320 });

    cancelAnimation(run);
    cancelAnimation(core);
    cancelAnimation(scale);
    run.value = 0;

    // Reduce-motion stops the loop but keeps the step readable: the dimmed body in the
    // step's colour is still there. It never removes the state itself.
    if (reduceMotion) {
      core.value = 1;
      scale.value = 1;
      return;
    }

    if (active) {
      // The phase changes the colour, never the motion — so a thinking → working
      // switch restarts the same lap in a new colour rather than changing gait.
      run.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), -1, false);
      core.value = withRepeat(
        withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
      scale.value = withTiming(1, { duration: 200 });
    } else {
      core.value = withTiming(1, { duration: 200 });
      scale.value = breathe
        ? withRepeat(
            withTiming(1.03, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
            -1,
            true
          )
        : withTiming(1, { duration: 200 });
    }
  }, [state, active, breathe, reduceMotion, fill, line, run, core, scale]);

  const bodyProps = useAnimatedProps(() => ({ fillOpacity: fill.value }));
  const coreProps = useAnimatedProps(() => ({ fillOpacity: core.value }));
  // Offsetting by a full length per lap moves the pattern once round the outline.
  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: -run.value * L,
    strokeOpacity: line.value,
  }));
  const breathStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const label =
    state === 'thinking'
      ? 'Igris is thinking'
      : state === 'working'
        ? 'Igris is working'
        : state === 'answering'
          ? 'Igris is answering'
          : 'Igris';

  return (
    <Animated.View
      accessible
      accessibilityRole={state === 'idle' ? 'image' : 'progressbar'}
      accessibilityLabel={label}
      style={[{ width: size * LOGO.aspect, height: size }, breathStyle]}>
      <Svg width="100%" height="100%" viewBox={LOGO.viewBox}>
        <Defs>
          <LinearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={metal.hi} />
            <Stop offset="0.42" stopColor={metal.mid} />
            <Stop offset="1" stopColor={metal.lo} />
          </LinearGradient>
        </Defs>

        <AnimatedPath d={LOGO.crown.d} fill={`url(#${gradient})`} animatedProps={bodyProps} />
        <AnimatedPath d={LOGO.flame.d} fill={metal.core} animatedProps={coreProps} />
        <AnimatedPath
          d={LOGO.crown.d}
          fill="none"
          stroke={metal.mid}
          strokeWidth={strokeFor(size)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={DASH}
          animatedProps={lineProps}
        />
      </Svg>
    </Animated.View>
  );
}

import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { laneMetal, type Tint } from '@/constants/theme';
import { LOGO } from '@/lib/logo';

/**
 * The Igris sigil, and — when asked — the sigil drawing itself.
 *
 * The animation is the icon's own construction: a tungsten line traces the crown's
 * outline, the core catches, and the fill floods in to land on exactly the artwork
 * that sits on the home screen. The splash therefore resolves into the launcher
 * icon rather than showing a second, unrelated logo.
 *
 * The trick is stroke-dasharray: dash the whole outline in one dash as long as the
 * path, start with the offset pushed a full length along so the dash sits entirely
 * outside the visible range, then animate the offset to zero. The stroke appears to
 * be drawn by a pen. `LOGO.crown.length` is measured at build time by
 * `assets/icon-src/build-icons.mjs`, because react-native-svg's getTotalLength()
 * is not dependable across platforms.
 *
 * Both paths are single closed subpaths, which is what makes this read as one
 * continuous gesture; a mark chopped into fragments would flicker on in pieces.
 */

/**
 * The crown is metal, not plastic. A flat fill reads as a sticker; a two-stop
 * vertical gradient reads as a lit helm. The lane colour sits at 42% — the mark's
 * optical centre — so the sigil states which brain answered before you read a word.
 *
 * `laneMetal('local')` must stay in step with GOLD_HI / AMBER / GOLD_LO / HOT in
 * assets/icon-src/build-icons.mjs, or the splash stops landing on the launcher icon.
 */
const METAL = 'igrisCrownMetal';

/** In viewBox units (the box is 748x850), so the line scales with the mark. */
const STROKE = 10;

const TRACE_MS = 1100;
const FLAME_DELAY = 700;
const FLAME_MS = 420;
const FLOOD_DELAY = 900;
const FLOOD_MS = 450;
/** The core lights last, after the crown has filled. */
const CORE_DELAY = FLOOD_DELAY + 150;
const STROKE_OUT_DELAY = 1200;
const STROKE_OUT_MS = 320;

export const MARK_DURATION_MS = STROKE_OUT_DELAY + STROKE_OUT_MS;

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function IgrisMark({
  size = 96,
  tint = 'local',
  animate = false,
  onDone,
}: {
  /** Height in px; width follows the mark's aspect. */
  size?: number;
  /**
   * Which metal to cast the sigil in. Defaults to 'local' (tungsten), which is
   * also what the launcher icon is, so the splash can leave this unset: it draws
   * before the saved preference has even been read.
   */
  tint?: Tint;
  animate?: boolean;
  onDone?: () => void;
}) {
  const metal = laneMetal(tint);
  // 0 → 1 for each stage. At 1 across the board with `line` at 0, the component
  // renders the launcher icon exactly.
  const trace = useSharedValue(animate ? 0 : 1);
  const flameTrace = useSharedValue(animate ? 0 : 1);
  const flood = useSharedValue(animate ? 0 : 1);
  const core = useSharedValue(animate ? 0 : 1);
  const line = useSharedValue(animate ? 1 : 0);

  useEffect(() => {
    if (!animate) {
      // Reduce-motion and static uses arrive at the end state rather than playing
      // it faster — the same rule animated-splash.tsx already follows.
      trace.value = 1;
      flameTrace.value = 1;
      flood.value = 1;
      core.value = 1;
      line.value = 0;
      return;
    }

    trace.value = withTiming(1, { duration: TRACE_MS, easing: Easing.inOut(Easing.cubic) });
    flameTrace.value = withDelay(
      FLAME_DELAY,
      withTiming(1, { duration: FLAME_MS, easing: Easing.out(Easing.cubic) })
    );
    flood.value = withDelay(
      FLOOD_DELAY,
      withTiming(1, { duration: FLOOD_MS, easing: Easing.out(Easing.quad) })
    );
    core.value = withDelay(
      CORE_DELAY,
      withTiming(1, { duration: FLOOD_MS, easing: Easing.out(Easing.quad) })
    );
    // The traced line and the fill are both tungsten, so the line is redundant once
    // the fill lands — and it straddles the outline, which would leave the mark a
    // few units fatter than the icon. Fade it out last.
    line.value = withDelay(
      STROKE_OUT_DELAY,
      withTiming(0, { duration: STROKE_OUT_MS, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished && onDone) runOnJS(onDone)();
      })
    );
  }, [animate, onDone, trace, flameTrace, flood, core, line]);

  const crownLine = useAnimatedProps(() => ({
    strokeDashoffset: LOGO.crown.length * (1 - trace.value),
    strokeOpacity: line.value,
  }));

  const flameLine = useAnimatedProps(() => ({
    strokeDashoffset: LOGO.flame.length * (1 - flameTrace.value),
    strokeOpacity: line.value,
  }));

  const crownFill = useAnimatedProps(() => ({ fillOpacity: flood.value }));
  const flameFill = useAnimatedProps(() => ({ fillOpacity: core.value }));

  return (
    <View style={{ width: size * LOGO.aspect, height: size }}>
      <Svg width="100%" height="100%" viewBox={LOGO.viewBox}>
        <Defs>
          <LinearGradient id={METAL} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={metal.hi} />
            <Stop offset="0.42" stopColor={metal.mid} />
            <Stop offset="1" stopColor={metal.lo} />
          </LinearGradient>
        </Defs>

        {/* Fills underneath, lines on top: the line is what the eye follows while
            the fill arrives under it. */}
        <AnimatedPath d={LOGO.crown.d} fill={`url(#${METAL})`} animatedProps={crownFill} />
        <AnimatedPath d={LOGO.flame.d} fill={metal.core} animatedProps={flameFill} />

        {/* The pen stays the flat lane colour rather than taking the gradient: the
            gradient's lower third is deep shade, which against the ground would make
            the line look like it fades out halfway down the crown. */}
        <AnimatedPath
          d={LOGO.crown.d}
          fill="none"
          stroke={metal.mid}
          strokeWidth={STROKE}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={LOGO.crown.length}
          animatedProps={crownLine}
        />
        <AnimatedPath
          d={LOGO.flame.d}
          fill="none"
          stroke={metal.core}
          strokeWidth={STROKE}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={LOGO.flame.length}
          animatedProps={flameLine}
        />
      </Svg>
    </View>
  );
}

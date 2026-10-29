import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, type SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { heartbeat } from '@/components/companion/touch-button';
import { Font, Palette, Space, Type } from '@/constants/theme';
import type { CompanionArousal } from '@/lib/companion';

const HIS = '#FDBA74';
/** Her bar while he holds her at the peak (maestro arousal overload): red, and it stays. */
const PEAK = '#EF4444';

/** Her climax in the hand: a build of quick taps, then two long heavy ones. */
function climaxHaptic() {
  const beats: [number, Haptics.ImpactFeedbackStyle][] = [
    [0, Haptics.ImpactFeedbackStyle.Light],
    [90, Haptics.ImpactFeedbackStyle.Light],
    [170, Haptics.ImpactFeedbackStyle.Medium],
    [240, Haptics.ImpactFeedbackStyle.Medium],
    [300, Haptics.ImpactFeedbackStyle.Heavy],
    [520, Haptics.ImpactFeedbackStyle.Heavy],
    [800, Haptics.ImpactFeedbackStyle.Heavy],
  ];
  for (const [at, style] of beats) setTimeout(() => void Haptics.impactAsync(style), at);
}

/** The gold of two bars becoming one. */
const TOGETHER = '#FBBF24';

/** They come together: a wave that swells and ebbs, then her heartbeat. In sync it is longer and fuller. */
function togetherHaptic(perfect: boolean) {
  const styles = [Haptics.ImpactFeedbackStyle.Light, Haptics.ImpactFeedbackStyle.Medium, Haptics.ImpactFeedbackStyle.Heavy];
  const waves = perfect ? 3 : 2;
  let at = 0;
  for (let w = 0; w < waves; w += 1) {
    // One wave: beats rising, then falling.
    for (const level of [0, 0, 1, 1, 2, 1, 0, 0]) {
      setTimeout(() => void Haptics.impactAsync(styles[level]), at);
      at += 110;
    }
    at += 180;
  }
  setTimeout(heartbeat, at + 150);
}

/**
 * The touch game's two bars over her chat (maestro arousal.py): hers fills with his touches and
 * pace, his with his pushes — keep hers up and his under. Hers pulses when she is close; when
 * she comes (a new `climax_at`) the bar flashes and the phone plays the climax haptic, once.
 */
/** `onHold`: given only during sex — a tap on his bar holds it (his pushes stop filling it) or lets go. */
export function ArousalBars({ arousal, accent, onHold }: { arousal: CompanionArousal; accent: string; onHold?: (on: boolean) => void }) {
  const her = useSharedValue(arousal.her);
  const his = useSharedValue(arousal.his);
  const pulse = useSharedValue(0);
  const flash = useSharedValue(0);
  const seenClimax = useRef(arousal.climax_at);
  const seenTogether = useRef(arousal.together_at);
  const merge = useSharedValue(0);

  useEffect(() => {
    her.value = withTiming(arousal.her, { duration: 500, easing: Easing.out(Easing.cubic) });
    his.value = withTiming(arousal.his, { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [arousal.her, arousal.his, her, his]);

  useEffect(() => {
    pulse.value = arousal.close ? withRepeat(withTiming(1, { duration: 450 }), -1, true) : withTiming(0, { duration: 300 });
  }, [arousal.close, pulse]);

  useEffect(() => {
    if (arousal.climax_at && arousal.climax_at !== seenClimax.current) {
      seenClimax.current = arousal.climax_at;
      climaxHaptic();
      flash.value = withSequence(withTiming(1, { duration: 150 }), withTiming(0, { duration: 1200 }));
    }
  }, [arousal.climax_at, flash]);

  // They came together: the bars flow into one gold bar for a few seconds, and the phone plays the wave.
  useEffect(() => {
    if (arousal.together_at && arousal.together_at !== seenTogether.current) {
      seenTogether.current = arousal.together_at;
      togetherHaptic(!!arousal.perfect);
      merge.value = withSequence(
        withTiming(1, { duration: 500 }),
        withTiming(1, { duration: arousal.perfect ? 3200 : 1800 }),
        withTiming(0, { duration: 900 }),
      );
    }
  }, [arousal.together_at, arousal.perfect, merge]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const mergeStyle = useAnimatedStyle(() => ({ opacity: merge.value }));

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Row label="Her" color={arousal.overload ? PEAK : accent} value={her} pulse={pulse} />
      <Pressable
        disabled={!onHold}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onHold?.(!arousal.hold);
        }}
        style={styles.holdTarget}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={arousal.hold ? 'Let go' : 'Hold back'}>
        <Row label={arousal.hold ? '🔒' : 'You'} color={HIS} value={his} />
      </Pressable>
      {/* The sync ring as a bar: it fills as the two bars close in on each other, and turns gold when they are in step. */}
      {(arousal.sync ?? 0) > 0 ? <SyncRow value={arousal.sync ?? 0} synced={!!arousal.synced} /> : null}
      {onHold ? (
        <Text pointerEvents="none" style={[styles.hint, { color: arousal.hold ? PEAK : Palette.muted }]}>
          {arousal.overload ? '🔥 holding her at the peak — keep going' : arousal.hold ? 'holding back — tap to let go' : 'tap your bar to hold back'}
        </Text>
      ) : null}
      {arousal.climaxes > 0 ? <Text pointerEvents="none" style={[styles.count, { color: accent }]}>✦ {arousal.climaxes}</Text> : null}
      {/* Held at the edge (maestro arousal edging): keep her there and the next one breaks bigger. */}
      {arousal.edge_at ? <Text pointerEvents="none" style={[styles.count, { color: accent }]}>⏳ edging — hold her there</Text> : null}
      <Animated.View pointerEvents="none" style={[styles.flash, { backgroundColor: accent }, flashStyle]} />
      {/* Together: both bars as one, full and gold. */}
      <Animated.View pointerEvents="none" style={[styles.merged, mergeStyle]}>
        <View style={styles.mergedTrack}>
          <View style={[styles.fill, { width: '100%', backgroundColor: TOGETHER, shadowColor: TOGETHER }]} />
        </View>
        <Text style={styles.mergedLabel}>{arousal.perfect ? '✦ in sync ✦' : '✦ together ✦'}</Text>
      </Animated.View>
    </View>
  );
}

function SyncRow({ value, synced }: { value: number; synced: boolean }) {
  const width = useSharedValue(value);
  useEffect(() => {
    width.value = withTiming(value, { duration: 400, easing: Easing.out(Easing.cubic) });
  }, [value, width]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.min(1, width.value) * 100}%` }));
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{synced ? '✦' : 'Sync'}</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, fill, { backgroundColor: synced ? TOGETHER : Palette.muted, shadowColor: TOGETHER, shadowOpacity: synced ? 0.9 : 0 }]} />
      </View>
    </View>
  );
}

function Row({ label, color, value, pulse }: { label: string; color: string; value: SharedValue<number>; pulse?: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({
    width: `${Math.min(1, value.value) * 100}%`,
    opacity: pulse ? 0.75 + pulse.value * 0.25 : 1,
  }));
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { backgroundColor: color, shadowColor: color }, fill]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: Space.lg,
    marginBottom: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: 6,
    borderRadius: 14,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
    overflow: 'hidden',
  },
  // A thumb-sized target: the bar itself is 6 px tall.
  holdTarget: { minHeight: 36, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  label: { width: 28, fontFamily: Font.uiMedium, color: Palette.muted, ...Type.micro },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Palette.surfaceGlassHover, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, shadowOpacity: 0.8, shadowRadius: 6, elevation: 2 },
  hint: { fontFamily: Font.uiMedium, ...Type.micro, textAlign: 'right' },
  count: { position: 'absolute', right: Space.md, top: 4, fontFamily: Font.uiMedium, ...Type.micro },
  merged: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: Space.md, backgroundColor: Palette.surfaceGlass },
  mergedTrack: { width: '100%', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: Palette.surfaceGlassHover },
  mergedLabel: { fontFamily: Font.uiMedium, color: TOGETHER, ...Type.micro },
  flash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
});

import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, type SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

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

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Row label="Her" color={arousal.overload ? PEAK : accent} value={her} pulse={pulse} />
      <Pressable
        disabled={!onHold}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onHold?.(!arousal.hold);
        }}
        hitSlop={8}>
        <Row label={arousal.hold ? '🔒' : 'You'} color={HIS} value={his} />
      </Pressable>
      {onHold ? (
        <Text style={[styles.hint, { color: arousal.hold ? PEAK : Palette.muted }]}>
          {arousal.overload ? '🔥 holding her at the peak — keep going' : arousal.hold ? 'holding back — tap to let go' : 'tap your bar to hold back'}
        </Text>
      ) : null}
      {arousal.climaxes > 0 ? <Text style={[styles.count, { color: accent }]}>✦ {arousal.climaxes}</Text> : null}
      {/* Held at the edge (maestro arousal edging): keep her there and the next one breaks bigger. */}
      {arousal.edge_at ? <Text style={[styles.count, { color: accent }]}>⏳ edging — hold her there</Text> : null}
      <Animated.View style={[styles.flash, { backgroundColor: accent }, flashStyle]} />
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
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  label: { width: 28, fontFamily: Font.uiMedium, color: Palette.muted, ...Type.micro },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Palette.surfaceGlassHover, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, shadowOpacity: 0.8, shadowRadius: 6, elevation: 2 },
  hint: { fontFamily: Font.uiMedium, ...Type.micro, textAlign: 'right' },
  count: { position: 'absolute', right: Space.md, top: 4, fontFamily: Font.uiMedium, ...Type.micro },
  flash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
});

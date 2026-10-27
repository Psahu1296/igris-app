/* eslint-disable react-hooks/immutability -- Reanimated shared values are written in handlers, as in pressable-scale.tsx */
import * as Haptics from 'expo-haptics';
import { Droplet, Feather, Flame, Hand, HandHeart, Heart, Magnet, Pointer, Sparkles, Zap, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Font, Palette, Space, Type } from '@/constants/theme';
import type { CompanionTouch } from '@/lib/companion';

/** Icon names the Mac may send (maestro companion/touch.py `icon`); an unknown one falls back to a hand. */
const ICONS: Record<string, LucideIcon> = { Droplet, Feather, Flame, Hand, HandHeart, Heart, Magnet, Pointer, Sparkles, Zap };
/** Taps closer together than this are one touch, stronger (touch.line on the Mac). */
const BURST_MS = 900;
/** The intimate touches feel heavier under the thumb. */
const HEAVY = new Set(['finger', 'squeeze', 'neck-bite', 'deep-kiss', 'caress']);

/**
 * The floating button over her chat: tap to touch her, the way the moment allows
 * (maestro companion/touch.py decides which touches fit). Taps in a burst build up — one
 * touch, stronger — and are sent once the burst ends. Long-press fans out the others.
 */
export function TouchButton({
  touches,
  disabled,
  accent,
  onTouch,
}: {
  touches: CompanionTouch[];
  disabled: boolean;
  accent: string;
  onTouch: (touch: CompanionTouch, taps: number) => void;
}) {
  // The picked touch stays while it still fits; when the moment changes it, the first one.
  const [picked, setPicked] = useState<string | null>(null);
  const active = touches.find((t) => t.id === picked) ?? touches[0];
  const [taps, setTaps] = useState(0);
  const [open, setOpen] = useState(false);
  const [sparks, setSparks] = useState<number[]>([]);
  const burst = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = useRef(0);
  const sending = useRef<CompanionTouch | null>(null);
  const sparkId = useRef(0);

  const bump = useSharedValue(1);
  const glow = useSharedValue(0);
  useEffect(() => {
    // A slow breathing glow: something here can be touched.
    glow.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [glow]);
  useEffect(() => () => {
    if (burst.current) clearTimeout(burst.current);
  }, []);
  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.25 + glow.value * 0.35, transform: [{ scale: 1 + glow.value * 0.12 }] }));

  if (!active) return null;
  const Icon = ICONS[active.icon] ?? Hand;

  const tap = (touch: CompanionTouch) => {
    if (disabled) return;
    if (sending.current && sending.current.id !== touch.id) {
      // Switching touch mid-burst: send the one in progress first.
      flush();
    }
    sending.current = touch;
    count.current += 1;
    setTaps(count.current);
    void Haptics.impactAsync(HEAVY.has(touch.id) ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    bump.value = withSequence(withTiming(0.86, { duration: 70 }), withSpring(1, { damping: 7, stiffness: 260 }));
    const id = (sparkId.current += 1);
    setSparks((s) => [...s.slice(-5), id]);
    setTimeout(() => setSparks((s) => s.filter((x) => x !== id)), 750);
    if (burst.current) clearTimeout(burst.current);
    burst.current = setTimeout(flush, BURST_MS);
  };

  const flush = () => {
    if (burst.current) clearTimeout(burst.current);
    burst.current = null;
    const touch = sending.current;
    const n = count.current;
    sending.current = null;
    count.current = 0;
    setTaps(0);
    if (touch && n > 0) onTouch(touch, n);
  };

  const choose = (touch: CompanionTouch) => {
    setPicked(touch.id);
    setOpen(false);
    tap(touch);
  };

  return (
    <View style={styles.anchor} pointerEvents="box-none">
      {open ? (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={styles.fan}>
          {touches.map((t) => {
            const TIcon = ICONS[t.icon] ?? Hand;
            const here = t.id === active.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => choose(t)}
                accessibilityRole="button"
                accessibilityLabel={t.label}
                style={[styles.option, here && { borderColor: accent }]}>
                <TIcon size={16} color={here ? accent : Palette.text} />
                <Text style={[styles.optionText, here && { color: accent }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </Animated.View>
      ) : null}

      <View style={styles.buttonWrap}>
        {sparks.map((id) => (
          <Spark key={id} color={accent} Icon={Icon} />
        ))}
        <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: accent }, ringStyle, disabled && styles.dim]} />
        <Animated.View style={buttonStyle}>
          <Pressable
            onPress={() => (open ? setOpen(false) : tap(active))}
            onLongPress={() => {
              if (disabled || touches.length < 2) return;
              void Haptics.selectionAsync();
              setOpen(true);
            }}
            delayLongPress={350}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${active.label}. Tap to touch her, hold for more`}
            style={[styles.button, { backgroundColor: accent }, disabled && styles.dim]}>
            <Icon size={24} color={Palette.ground} />
          </Pressable>
        </Animated.View>
        {taps > 1 ? (
          <View style={[styles.badge, { borderColor: accent }]}>
            <Text style={[styles.badgeText, { color: accent }]}>×{taps}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** One tap made visible: the touch's icon floats up from the button and fades. */
function Spark({ color, Icon }: { color: string; Icon: LucideIcon }) {
  const rise = useSharedValue(0);
  // A little sideways drift per spark, so a burst reads as many touches, not one.
  const [drift] = useState(() => (Math.random() - 0.5) * 36);
  useEffect(() => {
    rise.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
  }, [rise]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - rise.value,
    transform: [{ translateY: -60 * rise.value }, { translateX: drift * rise.value }, { scale: 0.8 + rise.value * 0.5 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.spark, style]}>
      <Icon size={18} color={color} fill={color} />
    </Animated.View>
  );
}

const SIZE = 56;

const styles = StyleSheet.create({
  anchor: { position: 'absolute', right: Space.lg, bottom: Space.lg, alignItems: 'flex-end' },
  buttonWrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  ring: { position: 'absolute', width: SIZE + 14, height: SIZE + 14, borderRadius: (SIZE + 14) / 2, borderWidth: 2 },
  dim: { opacity: 0.35 },
  spark: { position: 'absolute', top: 0 },
  badge: {
    position: 'absolute',
    top: -6,
    left: -10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: Palette.ground,
  },
  badgeText: { fontFamily: Font.uiMedium, ...Type.micro },
  fan: { gap: Space.sm, marginBottom: Space.md, alignItems: 'flex-end' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.ground,
  },
  optionText: { fontFamily: Font.uiMedium, color: Palette.text, ...Type.small },
});

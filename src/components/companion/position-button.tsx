/* eslint-disable react-hooks/immutability -- Reanimated shared values are written in handlers, as in touch-button.tsx */
import * as Haptics from 'expo-haptics';
import { Check, Shuffle } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Font, Palette, Space, Type } from '@/constants/theme';
import type { CompanionPosition } from '@/lib/companion';

/**
 * The second floating button over her chat, beside the touch one: switch how the two of you
 * are placed. The Mac offers the wheel only in an intimate moment (maestro poses.POSITIONS,
 * the same rule as the touches); a pick is his move, her reaction is a turn, and her next
 * photos are drawn in that position. The words are the Mac's: this file knows none of them.
 */
export function PositionButton({
  positions,
  current,
  disabled,
  accent,
  onPick,
}: {
  positions: CompanionPosition[];
  current: string | null;
  disabled: boolean;
  accent: string;
  onPick: (position: CompanionPosition) => void;
}) {
  const [open, setOpen] = useState(false);
  const bump = useSharedValue(1);
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [glow]);
  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.2 + glow.value * 0.3, transform: [{ scale: 1 + glow.value * 0.1 }] }));

  if (!positions.length) return null;
  const now = positions.find((p) => p.id === current);

  const pick = (position: CompanionPosition) => {
    setOpen(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    bump.value = withSequence(withTiming(0.86, { duration: 70 }), withSpring(1, { damping: 7, stiffness: 260 }));
    onPick(position);
  };

  return (
    <>
      <View style={styles.anchor} pointerEvents="box-none">
        <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: accent }, ringStyle, disabled && styles.dim]} />
        <Animated.View style={buttonStyle}>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setOpen(true);
            }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={now ? `Position: ${now.title}. Tap to change` : 'Change position'}
            style={[styles.button, { borderColor: accent }, disabled && styles.dim]}>
            <Shuffle size={22} color={accent} />
          </Pressable>
        </Animated.View>
        {now ? (
          <View style={[styles.badge, { borderColor: accent }]}>
            <Text style={[styles.badgeText, { color: accent }]} numberOfLines={1}>
              {now.title}
            </Text>
          </View>
        ) : null}
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.title}>POSITION</Text>
            <ScrollView contentContainerStyle={styles.grid}>
              {positions.map((p) => {
                const here = p.id === current;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => pick(p)}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.title}. ${p.about}`}
                    style={[styles.card, here && { borderColor: accent, backgroundColor: 'rgba(251, 113, 133, 0.10)' }]}>
                    <View style={styles.cardTop}>
                      <Text style={[styles.cardTitle, here && { color: accent }]} numberOfLines={1}>
                        {p.title}
                      </Text>
                      {here ? <Check size={14} color={accent} /> : null}
                    </View>
                    <Text style={styles.cardAbout} numberOfLines={2}>
                      {p.about}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const SIZE = 50;

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: Space.lg, bottom: Space.lg + 3, alignItems: 'center' },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    backgroundColor: Palette.ground,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  ring: { position: 'absolute', top: -7, width: SIZE + 14, height: SIZE + 14, borderRadius: (SIZE + 14) / 2, borderWidth: 2 },
  dim: { opacity: 0.35 },
  badge: {
    marginTop: 6,
    maxWidth: 110,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: Palette.ground,
  },
  badgeText: { fontFamily: Font.uiMedium, ...Type.micro },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '70%',
    backgroundColor: Palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    borderTopWidth: 1,
    borderColor: Palette.hairline,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Palette.hairlineBright, marginBottom: Space.md },
  title: { fontFamily: Font.uiMedium, color: Palette.faint, ...Type.micro, letterSpacing: 1.6, marginBottom: Space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  card: {
    width: '48.5%',
    padding: Space.md,
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.ground,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.xs },
  cardTitle: { flex: 1, fontFamily: Font.uiMedium, color: Palette.text, ...Type.small },
  cardAbout: { fontFamily: Font.ui, color: Palette.muted, ...Type.micro },
});

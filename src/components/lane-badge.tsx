import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Font, laneColor, Palette, Space, Type } from '@/constants/theme';
import type { Lane } from '@/lib/maestro';

export function LaneBadge({
  lane,
  probing,
  onPress,
}: {
  lane: Lane;
  probing: boolean;
  onPress: () => void;
}) {
  const [pulse] = useState(() => new Animated.Value(1));
  const [auraScale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!probing) {
      pulse.setValue(1);
      auraScale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(auraScale, { toValue: 1.8, duration: 600, useNativeDriver: true }),
          Animated.timing(auraScale, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [probing, pulse, auraScale]);

  const color = laneColor(lane);
  const glow = lane === 'local' ? Palette.localGlow : Palette.cloudGlow;

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={
        lane === 'local'
          ? 'Answering from the Mac. Tap to check again.'
          : 'Answering from Render. Tap to check for the Mac.'
      }
      style={[styles.badge, { borderColor: color + '44', backgroundColor: Palette.surfaceLift }]}>
      <View style={styles.dotContainer}>
        <Animated.View
          style={[
            styles.aura,
            { backgroundColor: glow, transform: [{ scale: auraScale }], opacity: pulse },
          ]}
        />
        <Animated.View style={[styles.dot, { backgroundColor: color, opacity: pulse }]} />
      </View>
      <Animated.Text style={[styles.label, { color }]}>
        {lane === 'local' ? 'MAC AI' : 'RENDER AI'}
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
    borderRadius: 14,
    borderWidth: 1,
  },
  dotContainer: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aura: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontFamily: Font.uiMedium,
    letterSpacing: 0.5,
    ...Type.micro,
  },
});


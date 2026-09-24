import * as Haptics from 'expo-haptics';
import { Cloud, Pin, RefreshCw, Zap } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Font, laneColor, laneGlow, Palette, Space, Type } from '@/constants/theme';
import type { Lane } from '@/lib/maestro';

export function LaneBadge({
  lane,
  probing,
  pinned = false,
  reachable = true,
  onPress,
}: {
  lane: Lane;
  probing: boolean;
  /** The user chose this lane by hand; the probe is not allowed to change it. */
  pinned?: boolean;
  /** False when a pinned lane failed its health probe. */
  reachable?: boolean;
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

  // An unreachable pin is the one state worth shouting about: the user has told us
  // to use a brain that is not answering, so every turn is about to fail.
  const down = pinned && !reachable;
  // The chip is coloured by the MODE, so Auto is recognisable at a glance; the icon
  // inside still says which brain the probe actually landed on (Zap = Mac,
  // Cloud = Render), so Auto never hides where your answers are coming from.
  const tint = pinned ? lane : 'auto';
  const color = down ? Palette.alert : laneColor(tint);
  const glow = down ? Palette.alertGlow : laneGlow(tint);
  const name = lane === 'local' ? 'the Mac' : 'Render';

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <PressableScale
      onPress={handlePress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={
        down
          ? `Pinned to ${name}, which is not answering. Tap to choose a lane.`
          : pinned
            ? `Pinned to ${name}. Tap to choose a lane.`
            : `Auto, answering from ${name}. Tap to choose a lane.`
      }
      style={[
        styles.badge,
        {
          // A pin draws a firmer edge, so an overridden lane never passes for Auto.
          borderColor: color + (pinned ? '99' : '44'),
          backgroundColor: Palette.surfaceLift,
          shadowColor: color,
        },
      ]}>
      <View style={styles.dotContainer}>
        <Animated.View
          style={[
            styles.aura,
            { backgroundColor: glow, transform: [{ scale: auraScale }], opacity: pulse },
          ]}
        />
        <View style={styles.iconWrapper}>
          {probing ? (
            <RefreshCw size={11} color={color} />
          ) : lane === 'local' ? (
            <Zap size={11} color={color} />
          ) : (
            <Cloud size={11} color={color} />
          )}
        </View>
      </View>
      <Animated.Text style={[styles.label, { color }]}>
        {pinned ? (lane === 'local' ? 'MAC' : 'RENDER') : 'AUTO'}
      </Animated.Text>
      {pinned ? <Pin size={9} color={color} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: 12,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 2,
  },
  dotContainer: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aura: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: Font.uiMedium,
    letterSpacing: 0.8,
    ...Type.micro,
    fontSize: 10,
  },
});

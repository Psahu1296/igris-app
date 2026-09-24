import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { laneColor, laneGlow, Palette, type Tint } from '@/constants/theme';

export type AiCoreMode = 'idle' | 'thinking' | 'speaking';

export function AiCore({
  tint,
  mode = 'idle',
  size = 72,
}: {
  tint: Tint;
  mode?: AiCoreMode;
  size?: number;
}) {
  const primaryColor = mode === 'thinking' ? Palette.thinking : laneColor(tint);
  const glowColor = mode === 'thinking' ? Palette.thinkingGlow : laneGlow(tint);

  // Shared values for animations
  const pulse = useSharedValue(0);
  const rotate = useSharedValue(0);
  const wave1 = useSharedValue(0.4);
  const wave2 = useSharedValue(0.7);
  const wave3 = useSharedValue(0.3);

  useEffect(() => {
    // Continuous breathing pulse
    pulse.value = withRepeat(
      withTiming(1, { duration: mode === 'thinking' ? 800 : 2000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );

    // Continuous rotation for outer ring
    rotate.value = withRepeat(
      withTiming(1, { duration: mode === 'thinking' ? 3000 : 8000, easing: Easing.linear }),
      -1,
      false
    );

    if (mode === 'speaking' || mode === 'thinking') {
      wave1.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 300 }),
          withTiming(0.2, { duration: 400 })
        ),
        -1,
        true
      );
      wave2.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 350 }),
          withTiming(0.9, { duration: 250 })
        ),
        -1,
        true
      );
      wave3.value = withRepeat(
        withSequence(
          withTiming(0.8, { duration: 450 }),
          withTiming(0.4, { duration: 300 })
        ),
        -1,
        true
      );
    }
  }, [mode, pulse, rotate, wave1, wave2, wave3]);

  const coreStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [0.92, 1.08]);
    const opacity = interpolate(pulse.value, [0, 1], [0.85, 1]);
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const auraStyle = useAnimatedStyle(() => {
    const scale = interpolate(pulse.value, [0, 1], [1, 1.45]);
    const opacity = interpolate(pulse.value, [0, 1], [0.4, 0.15]);
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const ringStyle = useAnimatedStyle(() => {
    const rotation = `${rotate.value * 360}deg`;
    return {
      transform: [{ rotate: rotation }],
    };
  });

  const wave1Style = useAnimatedStyle(() => ({
    height: interpolate(wave1.value, [0, 1], [size * 0.15, size * 0.45]),
  }));

  const wave2Style = useAnimatedStyle(() => ({
    height: interpolate(wave2.value, [0, 1], [size * 0.2, size * 0.6]),
  }));

  const wave3Style = useAnimatedStyle(() => ({
    height: interpolate(wave3.value, [0, 1], [size * 0.15, size * 0.4]),
  }));

  const outerRadius = size / 2;
  const innerRadius = size * 0.45;
  const coreRadius = size * 0.25;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Outer Glowing Radial Aura */}
      <Animated.View
        style={[
          styles.aura,
          {
            width: size,
            height: size,
            borderRadius: outerRadius,
            backgroundColor: glowColor,
          },
          auraStyle,
        ]}
      />

      {/* Orbiting Tech Ring */}
      <Animated.View
        style={[
          styles.ring,
          {
            width: size * 0.9,
            height: size * 0.9,
            borderRadius: innerRadius,
            borderColor: primaryColor,
          },
          ringStyle,
        ]}
      >
        <View style={[styles.ringDot, { backgroundColor: primaryColor }]} />
      </Animated.View>

      {/* Luminous Core Orb */}
      <Animated.View
        style={[
          styles.core,
          {
            width: size * 0.5,
            height: size * 0.5,
            borderRadius: coreRadius,
            backgroundColor: primaryColor,
            shadowColor: primaryColor,
          },
          coreStyle,
        ]}
      >
        {/* Audio Wave Visualizer Bars inside core when active */}
        {(mode === 'speaking' || mode === 'thinking') && (
          <View style={styles.waveRow}>
            <Animated.View style={[styles.waveBar, { backgroundColor: Palette.ground }, wave1Style]} />
            <Animated.View style={[styles.waveBar, { backgroundColor: Palette.ground }, wave2Style]} />
            <Animated.View style={[styles.waveBar, { backgroundColor: Palette.ground }, wave3Style]} />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  aura: {
    position: 'absolute',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    opacity: 0.6,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  ringDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: -2,
  },
  core: {
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  waveBar: {
    width: 2.5,
    borderRadius: 2,
  },
});

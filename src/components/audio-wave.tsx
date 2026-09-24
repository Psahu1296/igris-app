/* eslint-disable react-hooks/immutability */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export function AudioWave({
  active,
  color,
  barCount = 4,
  height = 18,
}: {
  active: boolean;
  color: string;
  barCount?: number;
  height?: number;
}) {
  const bars = Array.from({ length: barCount }, (_, i) => i);
  // Shared values for bar heights
  const h1 = useSharedValue(0.3);
  const h2 = useSharedValue(0.7);
  const h3 = useSharedValue(0.4);
  const h4 = useSharedValue(0.8);
  const h5 = useSharedValue(0.5);

  const sharedValues = [h1, h2, h3, h4, h5];

  useEffect(() => {
    if (!active) {
      sharedValues.forEach((sv) => {
        sv.value = withTiming(0.2, { duration: 300 });
      });
      return;
    }

    const configs = [
      { min: 0.2, max: 0.95, dur1: 250, dur2: 350 },
      { min: 0.3, max: 0.85, dur1: 320, dur2: 240 },
      { min: 0.15, max: 1.0, dur1: 280, dur2: 310 },
      { min: 0.25, max: 0.9, dur1: 340, dur2: 260 },
      { min: 0.3, max: 0.75, dur1: 220, dur2: 380 },
    ];

    for (let i = 0; i < barCount; i++) {
      const sv = sharedValues[i % sharedValues.length];
      const cfg = configs[i % configs.length];
      sv.value = withRepeat(
        withSequence(
          withTiming(cfg.max, { duration: cfg.dur1 }),
          withTiming(cfg.min, { duration: cfg.dur2 })
        ),
        -1,
        true
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, barCount]);

  return (
    <View style={[styles.container, { height }]}>
      {bars.map((i) => {
        const sv = sharedValues[i % sharedValues.length];
        return <WaveBar key={i} sv={sv} color={color} maxHeight={height} />;
      })}
    </View>
  );
}

function WaveBar({
  sv,
  color,
  maxHeight,
}: {
  sv: SharedValue<number>;
  color: string;
  maxHeight: number;
}) {
  const animStyle = useAnimatedStyle(() => ({
    height: Math.max(3, sv.value * maxHeight),
  }));

  return <Animated.View style={[styles.bar, { backgroundColor: color }, animStyle]} />;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
  },
});

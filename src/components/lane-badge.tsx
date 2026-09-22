import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Font, laneColor, Space, Type } from '@/constants/theme';
import type { Lane } from '@/lib/maestro';

/**
 * Which brain is answering, and a way to ask again.
 *
 * This is the only always-visible control, so it earns its place by being both
 * the status and the action: tap it to re-probe when you have just walked in the
 * door and want the Mac back. The dot breathes only while a probe is in flight —
 * motion here means "deciding", not decoration.
 */
export function LaneBadge({
  lane,
  probing,
  onPress,
}: {
  lane: Lane;
  probing: boolean;
  onPress: () => void;
}) {
  // Lazy useState, not useRef: an Animated.Value is read during render to build
  // the style, and reading a ref there is a correctness bug React now lints for.
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!probing) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 620, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 620, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [probing, pulse]);

  const color = laneColor(lane);

  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button"
      accessibilityLabel={lane === 'local' ? 'Answering from the Mac. Tap to check again.'
        : 'Answering from Render. Tap to check for the Mac.'}>
      <View style={styles.row}>
        <Animated.View style={[styles.dot, { backgroundColor: color, opacity: pulse }]} />
        <Animated.Text style={[styles.label, { color }]}>
          {lane === 'local' ? 'mac' : 'render'}
        </Animated.Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontFamily: Font.ui, ...Type.small },
});

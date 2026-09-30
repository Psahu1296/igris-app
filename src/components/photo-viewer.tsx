import { Image, type ImageSource } from 'expo-image';
import { X } from 'lucide-react-native';
import { Modal, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PressableScale } from '@/components/pressable-scale';
import { Palette, Space } from '@/constants/theme';

const MAX = 5;
const TAP_ZOOM = 2.5;

/**
 * One picture, full screen: pinch to zoom, drag to move it once zoomed, double tap to
 * zoom in and back, a single tap or the back button to close. `source` null = shut.
 */
export function PhotoViewer({ source, label, onClose }: { source: ImageSource | null; label?: string; onClose: () => void }) {
  return (
    <Modal visible={source !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* A Modal is its own native window: gestures need a root of their own inside it. */}
      <GestureHandlerRootView style={styles.fill}>{source ? <Zoomable source={source} label={label} onClose={onClose} /> : null}</GestureHandlerRootView>
    </Modal>
  );
}

function Zoomable({ source, label, onClose }: { source: ImageSource; label?: string; onClose: () => void }) {
  const scale = useSharedValue(1);
  const from = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const fromX = useSharedValue(0);
  const fromY = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    x.value = withTiming(0);
    y.value = withTiming(0);
  };
  const pinch = Gesture.Pinch()
    .onStart(() => {
      from.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(MAX, Math.max(0.8, from.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value <= 1.05) reset();
    });
  const pan = Gesture.Pan()
    .minPointers(1)
    .onStart(() => {
      fromX.value = x.value;
      fromY.value = y.value;
    })
    .onUpdate((e) => {
      // Only a zoomed picture moves; at rest a drag does nothing.
      if (scale.value <= 1) return;
      x.value = fromX.value + e.translationX;
      y.value = fromY.value + e.translationY;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) reset();
      else scale.value = withTiming(TAP_ZOOM);
    });
  const tap = Gesture.Tap().onEnd(() => {
    runOnJS(onClose)();
  });
  const gestures = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, tap));
  const moved = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <View style={styles.ground}>
      <GestureDetector gesture={gestures}>
        <Animated.View style={[styles.fill, moved]}>
          <Image source={source} style={styles.fill} contentFit="contain" accessibilityLabel={label ?? 'A picture'} />
        </Animated.View>
      </GestureDetector>
      <PressableScale onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
        <X size={18} color={Palette.text} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ground: { flex: 1, backgroundColor: 'rgba(5, 4, 9, 0.97)' },
  close: {
    position: 'absolute',
    top: Space.xl + Space.lg,
    right: Space.lg,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9, 8, 14, 0.7)',
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
  },
});

import * as Haptics from 'expo-haptics';
import { Image, type ImageSource } from 'expo-image';
import { Hand, X } from 'lucide-react-native';
import { useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, ZoomIn, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PressableScale } from '@/components/pressable-scale';
import { Font, Palette, Space, Type } from '@/constants/theme';

/** A place on her he can touch from her photo (maestro companion/touch.py SPOTS). */
export type TouchSpot = { id: string; label: string };

const MAX = 5;
const TAP_ZOOM = 2.5;

/**
 * One picture, full screen: pinch to zoom, drag to move it once zoomed, double tap to
 * zoom in and back, a single tap or the back button to close. `source` null = shut.
 *
 * With `spots` (her photos in the companion chat), a single tap touches her instead of closing:
 * a ripple where the finger landed and the spots that fit the moment around it; picking one
 * calls `onTouch` and closes, so her reaction is the next thing he sees. ✕ still closes.
 */
export function PhotoViewer({
  source,
  label,
  onClose,
  spots,
  accent = '#FB7185',
  onTouch,
}: {
  source: ImageSource | null;
  label?: string;
  onClose: () => void;
  spots?: TouchSpot[];
  accent?: string;
  onTouch?: (spot: TouchSpot) => void;
}) {
  return (
    <Modal visible={source !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      {/* A Modal is its own native window: gestures need a root of their own inside it. */}
      <GestureHandlerRootView style={styles.fill}>
        {source ? (
          <Zoomable
            source={source}
            label={label}
            onClose={onClose}
            spots={spots?.length && onTouch ? spots : undefined}
            accent={accent}
            onTouch={onTouch}
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function Zoomable({
  source,
  label,
  onClose,
  spots,
  accent,
  onTouch,
}: {
  source: ImageSource;
  label?: string;
  onClose: () => void;
  spots?: TouchSpot[];
  accent: string;
  onTouch?: (spot: TouchSpot) => void;
}) {
  // Where his finger landed on her photo, while the spot picker is up.
  const [touched, setTouched] = useState<{ x: number; y: number } | null>(null);
  const tapped = (x: number, y: number) => {
    if (!spots) return onClose();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTouched({ x, y });
  };
  const pick = (spot: TouchSpot) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTouched(null);
    onTouch?.(spot);
    onClose();
  };
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
  const tap = Gesture.Tap().onEnd((e) => {
    runOnJS(tapped)(e.absoluteX, e.absoluteY);
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
      {touched && spots ? (
        <>
          {/* A tap elsewhere puts the picker away. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTouched(null)} accessibilityLabel="Cancel" />
          <Animated.View
            entering={ZoomIn.duration(220)}
            pointerEvents="none"
            style={[styles.ripple, { left: touched.x - 28, top: touched.y - 28, borderColor: accent }]}
          />
          <Animated.View
            entering={FadeIn.duration(150)}
            exiting={FadeOut.duration(120)}
            // Below the finger, or above it when it landed in the lower part of the screen.
            style={[styles.spots, touched.y > Dimensions.get('window').height * 0.6
              ? { bottom: Dimensions.get('window').height - touched.y + 40 }
              : { top: Math.max(Space.huge, touched.y + 40) }]}>
            {spots.map((spot) => (
              <Pressable
                key={spot.id}
                onPress={() => pick(spot)}
                accessibilityRole="button"
                accessibilityLabel={`Touch ${spot.label}`}
                style={[styles.spot, { borderColor: accent }]}>
                <Text style={styles.spotText}>{spot.label}</Text>
              </Pressable>
            ))}
          </Animated.View>
        </>
      ) : null}
      {spots && !touched ? (
        // Nothing said a tap on her touches her, and he never found it (2026-10-28): said, until he does.
        <Animated.View entering={FadeIn.delay(300).duration(400)} pointerEvents="none" style={styles.hint}>
          <Hand size={14} color={accent} />
          <Text style={styles.hintText}>Tap her anywhere to touch her</Text>
        </Animated.View>
      ) : null}
      <PressableScale onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
        <X size={18} color={Palette.text} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ripple: { position: 'absolute', width: 56, height: 56, borderRadius: 28, borderWidth: 2 },
  spots: {
    position: 'absolute',
    left: Space.lg,
    right: Space.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Space.sm,
  },
  spot: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(9, 8, 14, 0.85)',
  },
  spotText: { fontFamily: Font.uiMedium, color: Palette.text, ...Type.small },
  ground: { flex: 1, backgroundColor: 'rgba(5, 4, 9, 0.97)' },
  hint: {
    position: 'absolute',
    bottom: Space.huge,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: 18,
    backgroundColor: 'rgba(9, 8, 14, 0.75)',
  },
  hintText: { fontFamily: Font.uiMedium, color: Palette.text, ...Type.small },
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

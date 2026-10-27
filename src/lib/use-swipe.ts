import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';

/** How far, or how fast, a finger must travel sideways to count as a swipe. */
const DISTANCE = 60;
const VELOCITY = 500;

/**
 * A sideways swipe for a GestureDetector: right opens the side menu, left closes it.
 *
 * Gesture handler, not RN's PanResponder: a PanResponder View around the chat's ScrollView
 * stopped the chat scrolling on the phone (2026-10-27). This pan only activates after 25px
 * sideways and fails as soon as the finger moves 12px vertically, so a vertical drag is the
 * ScrollView's from the start. Not an edge swipe — under gesture navigation the edge is
 * Android's Back. Pass a stable `onSwipe` (useCallback). The screen (or Modal) needs a
 * GestureHandlerRootView above it.
 */
export function useSwipe(direction: 'left' | 'right', onSwipe: () => void) {
  return useMemo(() => {
    const sign = direction === 'right' ? 1 : -1;
    return Gesture.Pan()
      .activeOffsetX(sign > 0 ? [-1000, 25] : [-25, 1000])
      .failOffsetY([-12, 12])
      .runOnJS(true)
      .onEnd((e) => {
        if (sign * e.translationX > DISTANCE || sign * e.velocityX > VELOCITY) onSwipe();
      });
  }, [direction, onSwipe]);
}

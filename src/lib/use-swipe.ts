import { useMemo } from 'react';
import { PanResponder, type PanResponderGestureState } from 'react-native';

/** How far, or how fast, a finger must travel sideways to count as a swipe. */
const DISTANCE = 60;
const VELOCITY = 0.5;

/**
 * A sideways swipe on whatever the returned handlers are spread onto: right opens the side
 * menu, left closes it. RN's own PanResponder, so it ships over the air (no native module).
 *
 * Not an edge swipe: under Android's gesture navigation the screen's edge belongs to the
 * system's Back, so the drawer could never be pulled from there. A clearly sideways move
 * anywhere counts instead, and only on the bubble phase, so a horizontal ScrollView inside
 * (a wide table, a code block) still claims its own drag first.
 *
 * Pass a stable `onSwipe` (useCallback): a new one rebuilds the responder, and a rebuild in
 * the middle of a drag would drop it.
 */
export function useSwipe(direction: 'left' | 'right', onSwipe: () => void) {
  return useMemo(() => {
    const sign = direction === 'right' ? 1 : -1;
    const sideways = (g: PanResponderGestureState) => sign * g.dx > 12 && Math.abs(g.dx) > 2 * Math.abs(g.dy);
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => sideways(g),
      onPanResponderRelease: (_, g) => {
        if (sign * g.dx > DISTANCE || sign * g.vx > VELOCITY) onSwipe();
      },
      onPanResponderTerminationRequest: () => true,
    }).panHandlers;
  }, [direction, onSwipe]);
}

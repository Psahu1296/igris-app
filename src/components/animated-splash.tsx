import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { IgrisMark } from '@/components/igris-mark';
import { Font, Palette, Type } from '@/constants/theme';

/**
 * The opening moment.
 *
 * The sigil draws itself — a tungsten line traces the crown, the core catches, and
 * the fill floods in — and lands on exactly the artwork that sits on the home
 * screen, so the app appears to finish drawing its own icon. Tungsten is the colour
 * that means "the Mac is answering", which is the state the app hopes to be in. The
 * name then resolves beside it.
 *
 * On Android `SplashScreen.setOptions({ fade })` does nothing (iOS only), so the
 * native splash is hidden only after this overlay has been laid out and painted.
 * Hiding it any earlier shows a frame of bare window between the two.
 */

const MARK_SIZE = 76;

export function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const [introDone, setIntroDone] = useState(false);
  // null until AccessibilityInfo answers. The stage stays empty for that frame or
  // two rather than starting the draw and then restarting it in the other mode —
  // the overlay is already painting the ground colour, so nothing flashes.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  // Lazy useState, not useRef: these values are read during render to build the
  // styles below, and reading a ref there is a bug React lints for.
  const [word] = useState(() => new Animated.Value(0)); // 0 → 1, opacity + slide
  const [cover] = useState(() => new Animated.Value(1)); // 1 → 0, the fade out

  // Painted, not merely mounted: this fires after layout, which is the earliest
  // point the overlay is actually covering the window.
  const handleLayout = useCallback(() => {
    void SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (cancelled) return;
      setReduceMotion(enabled);

      // Respect the setting by arriving at the final state, not by animating faster.
      if (enabled) {
        word.setValue(1);
        setIntroDone(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [word]);

  // The name is the sigil's follow-through, so it waits for the mark rather than
  // running on a timer that would drift out of step if the draw is retimed.
  const handleMarkDone = useCallback(() => {
    Animated.timing(word, {
      toValue: 1,
      duration: 380,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setIntroDone(true);
    });
  }, [word]);

  // Hold the curtain until the intro has played AND the session has resolved, so
  // the transcript never appears mid-animation and the sign-in form never flashes.
  useEffect(() => {
    if (!introDone || !ready) return;

    const timer = setTimeout(
      () =>
        Animated.timing(cover, {
          toValue: 0,
          duration: reduceMotion ? 120 : 420,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) onFinish();
        }),
      reduceMotion ? 200 : 420
    );

    return () => clearTimeout(timer);
  }, [introDone, ready, reduceMotion, cover, onFinish]);

  return (
    <Animated.View
      style={[styles.overlay, { opacity: cover }]}
      onLayout={handleLayout}
      pointerEvents="none">
      <View style={styles.stage}>
        {reduceMotion === null ? null : (
          <IgrisMark size={MARK_SIZE} animate={!reduceMotion} onDone={handleMarkDone} />
        )}

        <Animated.Text
          style={[
            styles.word,
            {
              opacity: word,
              transform: [
                { translateX: word.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) },
              ],
            },
          ]}>
          Igris
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Palette.ground,
    zIndex: 10,
  },
  stage: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  word: {
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    ...Type.title,
    marginLeft: 18,
  },
});

import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { Font, Palette, Type } from '@/constants/theme';

/**
 * The opening moment.
 *
 * It draws the same 2px rule that sits behind every answer Igris gives, so the
 * app's one structural device is also its first gesture rather than a logo that
 * appears nowhere else. The rule grows from a point in tungsten — the colour that
 * means "the Mac is answering" — like a lamp catching, then the name resolves
 * beside it.
 *
 * On Android `SplashScreen.setOptions({ fade })` does nothing (iOS only), so the
 * native splash is hidden only after this overlay has been laid out and painted.
 * Hiding it any earlier shows a frame of bare window between the two.
 */

const RULE_HEIGHT = 72;

export function AnimatedSplash({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const [introDone, setIntroDone] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  // Lazy useState, not useRef: these values are read during render to build the
  // styles below, and reading a ref there is a bug React lints for.
  const [rule] = useState(() => new Animated.Value(0)); // 0 → RULE_HEIGHT, drives height
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

      if (enabled) {
        // Respect the setting by arriving at the final state, not by animating faster.
        rule.setValue(RULE_HEIGHT);
        word.setValue(1);
        setIntroDone(true);
        return;
      }

      Animated.sequence([
        Animated.timing(rule, {
          toValue: RULE_HEIGHT,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false, // height is a layout prop
        }),
        Animated.timing(word, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && !cancelled) setIntroDone(true);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [rule, word]);

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
        {/* Centred container, so animating height alone grows the rule from a
            point outward in both directions — the ignition. */}
        <View style={styles.ruleSlot}>
          <Animated.View style={[styles.rule, { height: rule }]} />
        </View>

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
  ruleSlot: { height: RULE_HEIGHT, justifyContent: 'center' },
  rule: { width: 2, borderRadius: 1, backgroundColor: Palette.local },
  word: {
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    ...Type.title,
    marginLeft: 18,
  },
});

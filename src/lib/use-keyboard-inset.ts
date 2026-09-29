import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The bottom padding a screen needs so its composer clears the keyboard.
 *
 * Why this is hand-rolled rather than `KeyboardAvoidingView`: SDK 57 turns
 * edge-to-edge on by default, and on Android 15+ that makes the manifest's
 * `adjustResize` a no-op — so the window never resizes and KeyboardAvoidingView
 * has nothing to react to. Verified on a OnePlus 11R (Android 16): mounting a
 * KeyboardAvoidingView changed nothing, the composer stayed under the IME.
 *
 * Reanimated's `useAnimatedKeyboard` is the other no-new-dependency option, but
 * it is deprecated and documented to seize inset management for the whole app,
 * which would fight react-native-safe-area-context.
 *
 * The height React Native reports is the keyboard's inset MINUS the navigation bar
 * (ReactRootView.java: `imeInsets.bottom - barInsets.bottom`). Edge-to-edge, the app
 * draws down to the screen's edge, so the keyboard covers that bar's height too and it
 * must be added back. This used max() until 2026-09-29, which left the composer one
 * nav-bar short: the keyboard's suggestion and emoji strip sat over the input.
 */
export function useKeyboardInset(): number {
  const insets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboard(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return insets.bottom + keyboard;
}

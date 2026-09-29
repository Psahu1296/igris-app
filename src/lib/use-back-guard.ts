import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { BackHandler, ToastAndroid } from 'react-native';

const WINDOW_MS = 2000;

/**
 * Android's back button on the transcript, the root screen. By default back at the root
 * exits, and a cold start begins a new thread (state/session.tsx), so one stray back
 * press lost the conversation in front of you (reported 2026-09-29).
 *
 * `first` gets the press before anything else and returns true when it used it (the
 * transcript reopens the Chats list for a chat opened from there). Otherwise the first
 * press only warns, and a second within two seconds exits as usual.
 *
 * Registered on focus only: BackHandler listeners are global, so without that a press
 * on Todos or Favourites (pushed over this screen) would be caught here too. Open
 * sheets (the drawer, Chats, the lane menu) are Modals, which take back themselves.
 */
export function useBackGuard(first?: () => boolean) {
  const lastPress = useRef(0);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (first?.()) return true;
        const now = Date.now();
        if (now - lastPress.current < WINDOW_MS) return false; // let Android exit
        lastPress.current = now;
        ToastAndroid.show('Press back again to close Igris', ToastAndroid.SHORT);
        return true;
      });
      return () => sub.remove();
    }, [first])
  );
}

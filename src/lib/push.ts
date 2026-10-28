import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { companionWho } from '@/lib/companion';
import { authedFetch, type Lane } from '@/lib/maestro';

/**
 * Her messages on the lock screen (maestro companion/push.py). maestro pushes only what she
 * writes unasked — texting first, good morning, back from being busy — through Expo's push
 * service, to the token registered here. The words in a push are hers, read from the Mac.
 */
const CHANNEL = 'her-messages'; // maestro push.CHANNEL

// The open app already shows her messages: a banner over her own chat would be noise.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let registered: Lane | null = null;

/** Ask once per app start for permission and send the token to the Mac. Quiet on failure. */
export async function registerPush(lane: Lane): Promise<void> {
  if (registered === lane || Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Her messages',
      importance: Notifications.AndroidImportance.HIGH,
    });
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    const res = await authedFetch(lane, '/companion/push-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: data }),
    });
    if (res.ok) registered = lane;
  } catch {
    // An APK built before push (no native module, no FCM key): she is still there on opening.
  }
}

/** A tap on her push opens her chat — hers, not whoever was open last. */
export function usePushTaps(signedIn: boolean): void {
  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const who = last?.notification.request.content.data?.companion;
    if (!signedIn || typeof who !== 'string') return;
    companionWho.set(who);
    router.push('/companion');
  }, [last, signedIn]);
}

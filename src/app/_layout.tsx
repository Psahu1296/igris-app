// Subpath imports, not the package root: importing from the root pulls that
// package's index, which requires every weight and italic it ships (28 files for
// Newsreader alone) and registers them all as APK assets. We use five.
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { Newsreader_400Regular } from '@expo-google-fonts/newsreader/400Regular';
import { Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader/400Regular_Italic';
import { Newsreader_500Medium } from '@expo-google-fonts/newsreader/500Medium';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplash } from '@/components/animated-splash';
import { Palette } from '@/constants/theme';
import { SessionProvider, useSession } from '@/state/session';

SplashScreen.preventAutoHideAsync();

/**
 * Igris is dark-only on purpose: it is summoned by the power-button gesture, often
 * over another app at night. A light flash would be jarring, and a theme toggle is
 * not worth a settings row on an assistant with one screen.
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
  });

  // Returning null keeps the NATIVE splash up; AnimatedSplash only takes over once
  // the wordmark's typeface exists, or the name would render in a fallback face
  // and then jump.
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <Shell />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const { status } = useSession();
  const [splashDone, setSplashDone] = useState(false);
  const finish = useCallback(() => setSplashDone(true), []);

  return (
    <View style={{ flex: 1, backgroundColor: Palette.ground }}>
      <RootNavigator />
      {splashDone ? null : <AnimatedSplash ready={status !== 'loading'} onFinish={finish} />}
    </View>
  );
}

/**
 * The root layout must always render a Navigator, so auth is expressed as guards
 * rather than by swapping what gets returned. The splash overlay sits above it and
 * only lifts once the session has resolved, so the sign-in form never flashes
 * before we know whether there are stored credentials.
 */
function RootNavigator() {
  const { status } = useSession();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Palette.ground },
      }}>
      <Stack.Protected guard={status === 'signed-in'}>
        <Stack.Screen name="index" />
        <Stack.Screen name="voice" />
      </Stack.Protected>

      <Stack.Protected guard={status !== 'signed-in'}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

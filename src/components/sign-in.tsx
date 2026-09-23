import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AiCore } from '@/components/ai-core';
import { Answer, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space, Type } from '@/constants/theme';
import { AuthError } from '@/lib/maestro';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import { useSession } from '@/state/session';

export function SignIn() {
  const { signIn, lane } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bottomInset = useKeyboardInset();

  const ready = username.trim().length > 0 && password.length > 0 && !busy;
  const accent = laneColor(lane);

  const submit = async () => {
    if (!ready) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
    } catch (err) {
      setError(
        err instanceof AuthError
          ? 'Those credentials were rejected. Check them against OWNER_USERNAME and OWNER_PASSWORD in maestro.'
          : err instanceof Error
            ? err.message
            : 'Could not reach Igris.'
      );
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.fill, { paddingBottom: bottomInset }]}>
        <Animated.View entering={FadeInDown.springify()} style={styles.body}>
          {/* Hero Branding with AiCore */}
          <View style={styles.heroSection}>
            <AiCore lane={lane} mode={busy ? 'thinking' : 'idle'} size={90} />
            <Title style={styles.heroTitle}>Igris</Title>
            <Answer style={styles.lede}>Sign in with your maestro owner account.</Answer>
          </View>

          {/* Glass Form Fields Card */}
          <View style={styles.card}>
            <Field
              label="USERNAME"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="owner"
            />
            <View style={styles.divider} />
            <Field
              label="PASSWORD"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              onSubmitEditing={submit}
              placeholder="••••••••"
            />
          </View>

          {error ? <Answer style={styles.error}>{error}</Answer> : null}

          {/* Action Button */}
          <Pressable
            onPress={submit}
            disabled={!ready}
            accessibilityRole="button"
            style={[
              styles.button,
              {
                backgroundColor: ready ? accent : Palette.surfaceLift,
                shadowColor: ready ? accent : 'transparent',
              },
            ]}>
            <Text style={[styles.buttonLabel, { color: ready ? Palette.ground : Palette.faint }]}>
              {busy ? 'Authenticating…' : 'Sign in to Igris'}
            </Text>
          </Pressable>

          <Meta style={styles.footnote}>
            {lane === 'local'
              ? 'Connecting to Mac over Tailscale.'
              : 'Mac unreachable; signing into Render Cloud (may take 30s to wake).'}
          </Meta>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

function Field({
  label,
  placeholder,
  ...input
}: { label: string; placeholder?: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Meta style={styles.fieldLabel}>{label}</Meta>
      <TextInput
        {...input}
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={Palette.faint}
        cursorColor={Palette.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { flex: 1, backgroundColor: Palette.ground },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: Gutter, gap: Space.lg },
  heroSection: {
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.md,
  },
  heroTitle: {
    fontSize: 32,
    marginTop: Space.sm,
  },
  lede: { color: Palette.muted, textAlign: 'center', maxWidth: 320, fontSize: 14 },
  card: {
    backgroundColor: Palette.surfaceGlass,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    gap: Space.sm,
  },
  field: { gap: Space.xs },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    color: Palette.faint,
    fontFamily: Font.uiMedium,
  },
  input: {
    color: Palette.text,
    fontFamily: Font.ui,
    ...Type.ask,
    paddingVertical: Space.sm,
  },
  divider: {
    height: 1,
    backgroundColor: Palette.hairline,
  },
  error: { color: Palette.alert, ...Type.ask, textAlign: 'center' },
  button: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.sm,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonLabel: { fontFamily: Font.uiMedium, fontSize: 15, letterSpacing: 0.5 },
  footnote: { marginTop: Space.xs, textAlign: 'center', color: Palette.faint },
});


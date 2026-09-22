import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Answer, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space, Type } from '@/constants/theme';
import { AuthError } from '@/lib/maestro';
import { useSession } from '@/state/session';

export function SignIn() {
  const { signIn, lane } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = username.trim().length > 0 && password.length > 0 && !busy;

  const submit = async () => {
    if (!ready) return;
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
      <View style={styles.body}>
        <Title>Igris</Title>
        <Answer style={styles.lede}>Sign in with your maestro owner account.</Answer>

        <View style={styles.fields}>
          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            onSubmitEditing={submit}
          />
        </View>

        {error ? <Answer style={styles.error}>{error}</Answer> : null}

        <Pressable
          onPress={submit}
          disabled={!ready}
          accessibilityRole="button"
          style={[
            styles.button,
            { backgroundColor: ready ? laneColor(lane) : Palette.surfaceLift },
          ]}>
          <Text style={[styles.buttonLabel, { color: ready ? Palette.ground : Palette.faint }]}>
            {busy ? 'Signing in' : 'Sign in'}
          </Text>
        </Pressable>

        <Meta style={styles.footnote}>
          {lane === 'local'
            ? 'Signing in to the Mac over Tailscale.'
            : 'The Mac is not reachable, so this signs in to Render. It can take half a minute to wake.'}
        </Meta>
      </View>
    </SafeAreaView>
  );
}

function Field({ label, ...input }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Meta>{label}</Meta>
      <TextInput
        {...input}
        style={styles.input}
        placeholderTextColor={Palette.faint}
        cursorColor={Palette.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: Gutter, gap: Space.lg },
  lede: { color: Palette.muted, maxWidth: 420 },
  fields: { gap: Space.lg, marginTop: Space.md },
  field: { gap: Space.xs },
  input: {
    color: Palette.text,
    fontFamily: Font.ui,
    ...Type.ask,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Palette.hairline,
  },
  error: { color: Palette.alert, ...Type.ask },
  button: {
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.sm,
  },
  buttonLabel: { fontFamily: Font.uiMedium, ...Type.ask },
  footnote: { marginTop: Space.xs },
});

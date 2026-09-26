import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Download, RefreshCw, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { Answer, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space } from '@/constants/theme';
import {
  applyOta,
  checkApk,
  checkOta,
  installApk,
  installed,
  isReleaseBuild,
  runningBundle,
  type Release,
} from '@/lib/updates';
import { useSession } from '@/state/session';

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'ota' }                      // a JS update is downloaded; restart to run it
  | { kind: 'apk'; release: Release }    // a newer APK is on GitHub
  | { kind: 'installing'; release: Release }
  | { kind: 'error'; message: string };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

/**
 * Menu › Updates: what is running, and a way to get the newest. JS changes arrive over
 * the air; a release with native changes is a new APK (lib/updates.ts explains both).
 */
export default function UpdatesScreen() {
  const { lanePref } = useSession();
  const accent = laneColor(lanePref);
  const me = installed();
  const bundle = runningBundle();
  const release = isReleaseBuild();
  const [state, setState] = useState<State>({ kind: 'idle' });

  const check = useCallback(async () => {
    setState({ kind: 'checking' });
    try {
      // The APK first: a newer APK carries every JS change too, so it is the one to take.
      const apk = await checkApk();
      if (apk) return setState({ kind: 'apk', release: apk });
      const ota = await checkOta();
      setState(ota === 'ready' ? { kind: 'ota' } : { kind: 'current' });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Could not check for updates.' });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (release) void check();
  }, [release, check]);

  const install = async (r: Release) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setState({ kind: 'installing', release: r });
    try {
      await installApk(r);
      // Android's installer is showing now; Igris restarts once it finishes.
      setState({ kind: 'apk', release: r });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'The update failed.' });
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <RefreshCw size={20} color={accent} />
          <Title style={styles.headerTitle}>Updates</Title>
        </View>
        <PressableScale onPress={() => router.back()} hitSlop={12} accessibilityRole="button"
          accessibilityLabel="Close" style={styles.close}>
          <X size={18} color={Palette.text} />
        </PressableScale>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Meta style={styles.sectionTitle}>THIS PHONE</Meta>
          <Row label="App" value={me ? `${me.versionName} (build ${me.versionCode})` : 'unknown — rebuild the app'} />
          <Row label="Runtime" value={bundle.runtimeVersion ?? '—'} />
          <Row label="Channel" value={bundle.channel ?? (release ? '—' : 'dev (Metro)')} />
          <Row label="Running" value={bundle.embedded ? 'the JS built into the APK' :
            `update from ${bundle.createdAt ? bundle.createdAt.toLocaleString() : '—'}`} />
        </View>

        {!release ? (
          <Answer style={styles.note}>
            This is the dev build: its JS comes from Metro, and a release APK would install next to it as a second
            app. The Igris release app checks and installs updates here.
          </Answer>
        ) : (
          <View style={styles.section}>
            <Meta style={styles.sectionTitle}>NEWEST</Meta>
            {state.kind === 'checking' || state.kind === 'idle' ? <Answer style={styles.note}>Checking…</Answer> : null}
            {state.kind === 'current' ? <Answer style={styles.note}>Igris is up to date.</Answer> : null}
            {state.kind === 'ota' ? (
              <>
                <Answer style={styles.note}>An update is downloaded. Restart to use it.</Answer>
                <Button accent={accent} label="Restart now" onPress={() => void applyOta()} />
              </>
            ) : null}
            {state.kind === 'apk' || state.kind === 'installing' ? (
              <>
                <Answer style={styles.note}>
                  {`Igris ${state.release.version} is available (${mb(state.release.bytes)}).`}
                </Answer>
                {state.release.notes ? (
                  <Meta style={styles.notes} numberOfLines={12}>{state.release.notes}</Meta>
                ) : null}
                <Button
                  accent={accent}
                  label={state.kind === 'installing' ? 'Downloading… keep Igris open' : 'Download and install'}
                  disabled={state.kind === 'installing'}
                  onPress={() => void install(state.release)}
                />
                <Meta style={styles.footnote}>
                  Android asks you to confirm. Your chats, todos and settings stay.
                </Meta>
              </>
            ) : null}
            {state.kind === 'error' ? <Answer style={[styles.note, styles.error]}>{state.message}</Answer> : null}
            {state.kind !== 'checking' && state.kind !== 'installing' ? (
              <PressableScale onPress={() => void check()} accessibilityRole="button" style={styles.recheck}>
                <RefreshCw size={13} color={Palette.muted} />
                <Meta style={styles.recheckText}>Check again</Meta>
              </PressableScale>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Meta style={styles.rowLabel}>{label}</Meta>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Button({ label, onPress, accent, disabled }: {
  label: string; onPress: () => void; accent: string; disabled?: boolean;
}) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={[styles.button, { backgroundColor: accent }, disabled && styles.disabled]}>
      <Download size={16} color={Palette.ground} />
      <Text style={styles.buttonText}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
    paddingVertical: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  headerTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  headerTitle: { fontSize: 22 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  content: { padding: Gutter, gap: Space.xl, paddingBottom: Space.huge },
  section: { gap: Space.sm },
  sectionTitle: { fontSize: 10, letterSpacing: 1.2, color: Palette.faint },
  row: { flexDirection: 'row', gap: Space.md },
  rowLabel: { width: 70, color: Palette.muted },
  rowValue: { flex: 1, fontFamily: Font.ui, color: Palette.text, fontSize: 14 },
  note: { color: Palette.text, fontSize: 15, lineHeight: 22 },
  notes: { color: Palette.muted, fontSize: 12, lineHeight: 18 },
  error: { color: Palette.alert },
  footnote: { color: Palette.muted, fontSize: 12 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    borderRadius: 14,
  },
  disabled: { opacity: 0.6 },
  buttonText: { fontFamily: Font.uiMedium, color: Palette.ground, fontSize: 15 },
  recheck: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  recheckText: { color: Palette.muted, fontSize: 12 },
});

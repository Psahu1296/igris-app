import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Answer, Ask, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space, Type } from '@/constants/theme';
import { footprint, formatBytes, totalBytes } from '@/lib/assets/manifest';
import { useAssets, type AssetRow } from '@/lib/assets/use-assets';
import { speechStatus } from '@/lib/voice/tts';
import { useSession } from '@/state/session';

export default function Voice() {
  const { lane } = useSession();
  const { rows, loadError, reload, start, cancel, discard, downloadAll } = useAssets();

  const pending = rows?.filter((r) => r.phase !== 'ready') ?? [];
  const busy = rows?.some((r) => r.progress !== null) ?? false;
  const voice = rows?.find((r) => r.spec.id === 'voice')?.spec;
  const speech = rows ? speechStatus(voice) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Title>Voice</Title>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Meta>Back</Meta>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Answer style={styles.lede}>
          Igris speaks with the same Piper voice the Mac uses. The model is downloaded
          rather than shipped, so the app stays small and the voice can change without a
          new build.
        </Answer>

        {loadError ? (
          <View style={styles.block}>
            <Answer style={styles.error}>{loadError}</Answer>
            <Pressable onPress={() => void reload()} accessibilityRole="button">
              <Ask style={styles.action}>Try again</Ask>
            </Pressable>
          </View>
        ) : null}

        {rows === null && !loadError ? <Meta>Reading the asset list…</Meta> : null}

        {rows?.map((row) => (
          <Row
            key={row.spec.id}
            row={row}
            accent={laneColor(lane)}
            onStart={() => void start(row.spec)}
            onCancel={() => cancel(row.spec)}
            onDiscard={() => discard(row.spec)}
          />
        ))}

        {pending.length > 0 && !busy ? (
          <Pressable
            onPress={() => void downloadAll()}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: laneColor(lane) }]}>
            <Ask style={styles.primaryLabel}>
              {`Download ${formatBytes(totalBytes(pending.map((r) => r.spec)))}`}
            </Ask>
          </Pressable>
        ) : null}

        {speech?.ready ? (
          <Meta style={styles.footnote}>Igris will speak its answers.</Meta>
        ) : speech && pending.length === 0 ? (
          <Meta style={styles.footnote}>{speech.reason}</Meta>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  row,
  accent,
  onStart,
  onCancel,
  onDiscard,
}: {
  row: AssetRow;
  accent: string;
  onStart: () => void;
  onCancel: () => void;
  onDiscard: () => void;
}) {
  const { spec, phase, progress, error } = row;
  const working = progress !== null;
  const percent = Math.round((progress ?? 0) * 100);

  const status = working
    ? phase === 'extracting'
      ? `Unpacking, ${percent}%`
      : `${percent}% of ${formatBytes(spec.bytes)}`
    : phase === 'ready'
      ? `On this phone, ${formatBytes(footprint(spec))}`
      : phase === 'damaged'
        ? 'Corrupt — download it again'
        : phase === 'extracting'
          ? 'Downloaded but not unpacked'
          : // Say what it costs to keep, not just what it costs to fetch.
            `${formatBytes(spec.bytes)} to download, ${formatBytes(footprint(spec))} once unpacked`;

  const actionLabel = working
    ? 'Stop'
    : phase === 'ready'
      ? 'Remove'
      : phase === 'extracting'
        ? 'Unpack'
        : 'Download';

  return (
    <View style={styles.row}>
      <View style={[styles.rule, { backgroundColor: phase === 'ready' ? accent : Palette.hairline }]} />
      <View style={styles.rowBody}>
        <Ask style={styles.rowTitle}>{spec.title}</Ask>
        <Meta style={styles.rowDetail}>{spec.detail}</Meta>

        {working ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { backgroundColor: accent, width: `${percent}%` }]} />
          </View>
        ) : null}

        <View style={styles.rowFooter}>
          <Meta>{status}</Meta>
          <Pressable
            onPress={working ? onCancel : phase === 'ready' ? onDiscard : onStart}
            hitSlop={8}
            accessibilityRole="button">
            <Meta style={{ color: accent }}>{actionLabel}</Meta>
          </Pressable>
        </View>

        {error ? <Meta style={styles.error}>{error}</Meta> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
    paddingTop: Space.sm,
    paddingBottom: Space.lg,
  },
  content: { paddingHorizontal: Gutter, paddingBottom: Space.huge, gap: Space.xl },
  lede: { color: Palette.muted, maxWidth: 420 },
  block: { gap: Space.sm },
  row: { flexDirection: 'row' },
  rule: { width: 2, borderRadius: 1, marginRight: Gutter - 2 },
  rowBody: { flex: 1, gap: Space.xs },
  rowTitle: { color: Palette.text },
  rowDetail: { maxWidth: 420 },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.xs,
  },
  progressTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: Palette.hairline,
    marginTop: Space.sm,
    overflow: 'hidden',
  },
  progressFill: { height: 2, borderRadius: 1 },
  primary: { height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { color: Palette.ground, fontFamily: Font.uiMedium, ...Type.ask },
  error: { color: Palette.alert },
  action: { color: Palette.text },
  footnote: { marginTop: Space.sm },
});

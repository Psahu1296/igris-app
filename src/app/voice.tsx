import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Answer, Ask, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space } from '@/constants/theme';
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
  const accent = laneColor(lane);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <Title style={styles.headerTitle}>Voice Models</Title>
          <View style={[styles.headerDot, { backgroundColor: accent }]} />
        </View>
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={12}
          accessibilityRole="button"
          style={styles.backPill}>
          <Meta style={styles.backText}>Close</Meta>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Answer style={styles.lede}>
          Igris speaks with the Piper voice model on-device. Assets download on demand to keep the binary small.
        </Answer>

        {loadError ? (
          <View style={styles.errorCard}>
            <Answer style={styles.error}>{loadError}</Answer>
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                void reload();
              }}
              accessibilityRole="button"
              style={styles.retryButton}>
              <Ask style={styles.retryText}>Retry Download</Ask>
            </Pressable>
          </View>
        ) : null}

        {rows === null && !loadError ? (
          <View style={styles.loadingBox}>
            <Meta style={styles.loadingText}>Reading asset manifest…</Meta>
          </View>
        ) : null}

        {rows?.map((row, idx) => (
          <Animated.View key={row.spec.id} entering={FadeInUp.delay(80 * idx).springify()}>
            <Row
              row={row}
              accent={accent}
              onStart={() => void start(row.spec)}
              onCancel={() => cancel(row.spec)}
              onDiscard={() => discard(row.spec)}
            />
          </Animated.View>
        ))}

        {pending.length > 0 && !busy ? (
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              void downloadAll();
            }}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: accent, shadowColor: accent }]}>
            <Text style={styles.primaryLabel}>
              {`Download All (${formatBytes(totalBytes(pending.map((r) => r.spec)))})`}
            </Text>
          </Pressable>
        ) : null}

        {speech?.ready ? (
          <View style={styles.statusBanner}>
            <Text style={styles.statusBannerIcon}>⚡</Text>
            <Meta style={styles.statusBannerText}>Voice engine ready. Igris speaks automatically.</Meta>
          </View>
        ) : speech && pending.length === 0 ? (
          <View style={styles.statusBanner}>
            <Meta style={styles.statusBannerText}>{speech.reason}</Meta>
          </View>
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
      ? `Unpacking archive… ${percent}%`
      : `Downloading… ${percent}% (${formatBytes(spec.bytes)})`
    : phase === 'ready'
      ? `Installed (${formatBytes(footprint(spec))})`
      : phase === 'damaged'
        ? 'Corrupt package — tap to redownload'
        : phase === 'extracting'
          ? 'Downloaded — needs unpacking'
          : `${formatBytes(spec.bytes)} download, ${formatBytes(footprint(spec))} unpacked`;

  const actionLabel = working
    ? 'Stop'
    : phase === 'ready'
      ? 'Remove'
      : phase === 'extracting'
        ? 'Unpack'
        : 'Download';

  const handleAction = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (working) onCancel();
    else if (phase === 'ready') onDiscard();
    else onStart();
  };

  return (
    <View style={[styles.card, { borderColor: phase === 'ready' ? accent + '44' : Palette.hairline }]}>
      <View style={[styles.cardSpine, { backgroundColor: phase === 'ready' ? accent : Palette.faint }]} />

      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <Ask style={styles.rowTitle}>{spec.title}</Ask>
          <View
            style={[
              styles.phaseBadge,
              {
                backgroundColor: phase === 'ready' ? accent + '22' : Palette.surfaceLift,
                borderColor: phase === 'ready' ? accent + '44' : Palette.hairline,
              },
            ]}>
            <Text
              style={[
                styles.phaseBadgeText,
                { color: phase === 'ready' ? accent : Palette.muted },
              ]}>
              {phase.toUpperCase()}
            </Text>
          </View>
        </View>

        <Meta style={styles.rowDetail}>{spec.detail}</Meta>

        {working ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { backgroundColor: accent, width: `${percent}%` }]} />
          </View>
        ) : null}

        <View style={styles.rowFooter}>
          <Meta style={styles.statusMeta}>{status}</Meta>
          <Pressable
            onPress={handleAction}
            hitSlop={8}
            accessibilityRole="button"
            style={[
              styles.actionPill,
              {
                backgroundColor: phase === 'ready' ? Palette.surfaceLift : accent + '1E',
                borderColor: accent + '44',
              },
            ]}>
            <Text style={[styles.actionPillText, { color: accent }]}>{actionLabel}</Text>
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
    paddingBottom: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  headerTitle: {
    fontSize: 24,
  },
  headerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  backPill: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: 12,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  backText: {
    color: Palette.text,
    fontFamily: Font.uiMedium,
  },
  content: { paddingHorizontal: Gutter, paddingVertical: Space.lg, gap: Space.lg },
  lede: { color: Palette.muted, fontSize: 15, lineHeight: 22 },
  loadingBox: {
    padding: Space.lg,
    alignItems: 'center',
  },
  loadingText: { color: Palette.faint },
  errorCard: {
    padding: Space.lg,
    borderRadius: 14,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.alert + '44',
    gap: Space.md,
  },
  error: { color: Palette.alert },
  retryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: 8,
    backgroundColor: Palette.surfaceLift,
  },
  retryText: { color: Palette.text },
  card: {
    flexDirection: 'row',
    backgroundColor: Palette.surfaceGlass,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardSpine: {
    width: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  cardContent: {
    flex: 1,
    padding: Space.lg,
    gap: Space.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowTitle: { color: Palette.text, fontSize: 16 },
  phaseBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  phaseBadgeText: {
    fontFamily: Font.uiMedium,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  rowDetail: { color: Palette.muted, fontSize: 12, lineHeight: 18 },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.md,
  },
  statusMeta: {
    color: Palette.faint,
    fontSize: 11,
    flex: 1,
    paddingRight: Space.sm,
  },
  actionPill: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionPillText: {
    fontFamily: Font.uiMedium,
    fontSize: 12,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Palette.hairline,
    marginTop: Space.sm,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2 },
  primary: {
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Space.md,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryLabel: { color: Palette.ground, fontFamily: Font.uiMedium, fontSize: 15 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.md,
    borderRadius: 12,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
    marginTop: Space.sm,
  },
  statusBannerIcon: { fontSize: 14 },
  statusBannerText: { color: Palette.muted, fontSize: 12 },
});


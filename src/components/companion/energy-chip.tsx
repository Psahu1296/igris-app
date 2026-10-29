import { StyleSheet, Text, View } from 'react-native';

import { Font, Palette, Space, Type } from '@/constants/theme';
import type { CompanionEnergy } from '@/lib/companion';

/** Each stage of her wearing out: how it is named, and its colour (maestro companion/fatigue.py). */
const STAGES = {
  numb: { label: 'Numb · reactions dull', color: '#F59E0B' },
  drowsy: { label: 'Drowsy · close to sleep', color: '#F97316' },
  out: { label: 'Out', color: '#818CF8' },
} as const;
const TAGS = { sore: 'sore', slow: 'asked you to slow down' } as const;

/** "wakes in ~12 min" from the Mac's wake time; "waking" once it has passed. */
function wakes(until: string | null | undefined, kind: string): string {
  const minutes = until ? Math.round((new Date(until).getTime() - Date.now()) / 60_000) : NaN;
  const who = kind === 'faint' ? 'fainted' : 'asleep';
  return Number.isNaN(minutes) || minutes <= 0 ? `${who} · waking` : `${who} · wakes in ~${minutes} min`;
}

/**
 * How worn out she is, in any moment (the bars only show mid-scene): an energy bar draining as
 * she numbs and tires, her stage in words, and what she is out for if she has fainted or fallen
 * asleep. Small chips for being sore and for having asked him to slow down.
 */
export function EnergyChip({ energy }: { energy: CompanionEnergy }) {
  const stage = energy.stage ? STAGES[energy.stage] : null;
  const label = !stage ? null : energy.stage === 'out' ? wakes(energy.until, energy.kind) : stage.label;
  return (
    <View style={styles.wrap} accessibilityLabel={`Her energy: ${label ?? 'fine'}`}>
      {stage ? (
        <View style={styles.row}>
          <Text style={[styles.label, { color: stage.color }]}>{label}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(energy.energy * 100)}%`, backgroundColor: stage.color }]} />
          </View>
        </View>
      ) : null}
      {energy.tags.length ? (
        <View style={styles.tags}>
          {energy.tags.map((t) => (
            <Text key={t} style={styles.tag}>
              {TAGS[t]}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: Space.lg, marginBottom: Space.sm, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  label: { fontFamily: Font.uiMedium, ...Type.micro },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Palette.surfaceGlassHover, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  tags: { flexDirection: 'row', gap: Space.sm },
  tag: {
    fontFamily: Font.uiMedium,
    color: Palette.muted,
    ...Type.micro,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Palette.hairline,
    overflow: 'hidden',
  },
});

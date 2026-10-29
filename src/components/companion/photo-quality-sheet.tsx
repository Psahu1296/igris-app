import * as Haptics from 'expo-haptics';
import { Minus, Plus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, sheetStyles } from '@/components/companion/bottom-sheet';
import { PressableScale } from '@/components/pressable-scale';
import { TypingIndicator } from '@/components/typing-indicator';
import { Meta } from '@/components/typography';
import { Font, Gutter, Palette, Space, Type } from '@/constants/theme';
import { fetchPhotoQuality, setPhotoQuality, type PhotoQuality } from '@/lib/companion';
import type { Lane } from '@/lib/maestro';

/**
 * How detailed her photos are: the drawing steps (maestro companion/quality.py), changed any
 * time and used by the next photo. More steps add texture and take longer; fewer are quick drafts.
 * The Mac keeps the value; every tap saves it.
 */
export function PhotoQualitySheet({ lane, accent, onClose }: { lane: Lane; accent: string; onClose: () => void }) {
  const [quality, setQuality] = useState<PhotoQuality | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchPhotoQuality(lane)
      .then((got) => live && setQuality(got))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [lane]);

  const pick = (steps: number) => {
    if (!quality || steps < quality.min || steps > quality.max || steps === quality.steps) return;
    void Haptics.selectionAsync();
    setQuality({ ...quality, steps });
    setPhotoQuality(lane, steps)
      .then(setQuality)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <BottomSheet title="Photo detail" error={error} onClose={onClose}>
      {quality === null && !error ? (
        <View style={sheetStyles.empty}>
          <TypingIndicator color={accent} />
        </View>
      ) : quality ? (
        <View style={styles.body}>
          <Meta>More steps: more texture and detail, and a slower photo. Fewer: quick drafts. The next photo uses it.</Meta>
          <View style={styles.stepper}>
            <PressableScale onPress={() => pick(quality.steps - 1)} accessibilityRole="button" accessibilityLabel="Fewer steps" style={styles.step}>
              <Minus size={20} color={Palette.text} />
            </PressableScale>
            <View style={styles.value}>
              <Text style={[styles.number, { color: accent }]}>{quality.steps}</Text>
              <Meta>steps · about {(quality.steps / quality.default).toFixed(1)}× the usual time</Meta>
            </View>
            <PressableScale onPress={() => pick(quality.steps + 1)} accessibilityRole="button" accessibilityLabel="More steps" style={styles.step}>
              <Plus size={20} color={Palette.text} />
            </PressableScale>
          </View>
          <View style={styles.presets}>
            {quality.presets.map((p) => {
              const on = quality.steps === p.steps;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => pick(p.steps)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${p.label}, ${p.steps} steps`}
                  style={[styles.preset, { borderColor: on ? accent : Palette.hairline }, on && { backgroundColor: `${accent}26` }]}>
                  <Text style={[styles.presetLabel, on && { color: accent }]}>{p.label}</Text>
                  <Text style={styles.presetSteps}>{p.steps}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Gutter, gap: Space.lg, paddingBottom: Space.lg },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.md },
  step: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  value: { flex: 1, alignItems: 'center', gap: 2 },
  number: { fontFamily: Font.uiMedium, fontSize: 40, lineHeight: 44 },
  presets: { flexDirection: 'row', gap: Space.sm },
  preset: { flex: 1, alignItems: 'center', paddingVertical: Space.sm, borderRadius: 14, borderWidth: 1, gap: 2 },
  presetLabel: { fontFamily: Font.uiMedium, color: Palette.text, ...Type.small },
  presetSteps: { fontFamily: Font.ui, color: Palette.muted, ...Type.micro },
});

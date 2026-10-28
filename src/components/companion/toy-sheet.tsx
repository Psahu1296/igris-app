import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '@/components/companion/bottom-sheet';
import { Meta } from '@/components/typography';
import { Font, Palette, Space, Type } from '@/constants/theme';
import type { CompanionToy } from '@/lib/companion';

/**
 * His remote for her toy (maestro companion/toy.py): a level 0-10 and a pattern. Each change is
 * a turn — she feels it and answers — so the sheet closes on a pick and the chat shows her reaction.
 */
export function ToySheet({
  toy,
  accent,
  busy,
  onSet,
  onClose,
}: {
  toy: CompanionToy;
  accent: string;
  busy: boolean;
  onSet: (level: number, pattern: string) => void;
  onClose: () => void;
}) {
  const [pattern, setPattern] = useState(toy.pattern || toy.patterns[0]?.id || '');
  const levels = Array.from({ length: toy.max + 1 }, (_, i) => i);
  const set = (level: number) => {
    void Haptics.impactAsync(level >= 7 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
    onSet(level, pattern);
  };

  return (
    <BottomSheet title="🎛️ Her toy" onClose={onClose}>
      <View style={styles.body}>
        <Meta style={styles.lead}>{toy.level ? `On now: level ${toy.level}` : 'Off'} · she feels every change and tells you</Meta>
        <View style={styles.patterns}>
          {toy.patterns.map((p) => {
            const on = p.id === pattern;
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setPattern(p.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, on && { borderColor: accent, backgroundColor: 'rgba(251, 113, 133, 0.14)' }]}>
                <Text style={[styles.chipText, on && { color: accent }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.levels}>
          {levels.map((level) => {
            const on = level === toy.level;
            return (
              <Pressable
                key={level}
                disabled={busy}
                onPress={() => set(level)}
                accessibilityRole="button"
                accessibilityLabel={level ? `Level ${level}` : 'Off'}
                style={[
                  styles.level,
                  { height: 22 + level * 5, backgroundColor: level ? `rgba(251, 113, 133, ${0.15 + level * 0.075})` : Palette.surface },
                  on && { borderColor: accent, borderWidth: 2 },
                  busy && styles.off,
                ]}>
                <Text style={styles.levelText}>{level || 'off'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Space.md, paddingBottom: Space.md },
  lead: { color: Palette.muted },
  patterns: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  chip: { paddingHorizontal: Space.md, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Palette.hairline },
  chipText: { fontFamily: Font.uiMedium, color: Palette.muted, ...Type.small },
  levels: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  level: { flex: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3, borderWidth: 1, borderColor: 'transparent' },
  levelText: { fontFamily: Font.uiMedium, color: Palette.text, ...Type.micro },
  off: { opacity: 0.4 },
});

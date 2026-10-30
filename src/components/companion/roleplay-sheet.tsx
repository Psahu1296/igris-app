import { Dices } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet, sheetStyles } from '@/components/companion/bottom-sheet';
import { PressableScale } from '@/components/pressable-scale';
import { TypingIndicator } from '@/components/typing-indicator';
import { Meta } from '@/components/typography';
import { Font, Palette, Space } from '@/constants/theme';
import { fetchOpening, type CompanionScene } from '@/lib/companion';
import type { Lane } from '@/lib/maestro';

/**
 * Before a roleplay starts: how it begins. The Mac draws an opening (the card's setup plus a random
 * twist, maestro scenes.opening); he keeps it, draws another, or writes his own context, and she
 * starts from exactly that text — every turn of the role hears it.
 */
export function RoleplaySheet({
  lane,
  scene,
  accent,
  onStart,
  onClose,
}: {
  lane: Lane;
  scene: CompanionScene;
  accent: string;
  onStart: (context: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchIt = useCallback(() => {
    fetchOpening(lane, scene.id)
      .then((opening) => setText(opening ?? ''))
      .catch((e: unknown) => {
        setText('');
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [lane, scene.id]);

  useEffect(fetchIt, [fetchIt]);

  const draw = () => {
    setText(null);
    fetchIt();
  };

  return (
    <BottomSheet title={`${scene.emoji ? `${scene.emoji} ` : ''}${scene.title}`} error={error} onClose={onClose}>
      <ScrollView contentContainerStyle={sheetStyles.list} keyboardShouldPersistTaps="handled">
        <Meta>How it starts. Keep it, draw another, or write your own: she plays it from exactly this.</Meta>
        {text === null ? (
          <View style={sheetStyles.empty}>
            <TypingIndicator color={accent} />
          </View>
        ) : (
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Where you are, who you two are, what is going on…"
            placeholderTextColor={Palette.faint}
            style={styles.input}
            multiline
            maxLength={500}
            accessibilityLabel="How the roleplay starts"
          />
        )}
        <View style={styles.actions}>
          <PressableScale onPress={draw} accessibilityRole="button" accessibilityLabel="Draw another opening" style={styles.button}>
            <Dices size={14} color={Palette.text} />
            <Text style={styles.label}>Another</Text>
          </PressableScale>
          <PressableScale
            onPress={() => onStart((text ?? '').trim())}
            disabled={text === null}
            accessibilityRole="button"
            style={[styles.button, { backgroundColor: accent, borderColor: accent }, text === null && styles.dim]}>
            <Text style={[styles.label, styles.labelOn]}>Start</Text>
          </PressableScale>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: Font.ui,
    fontSize: 14,
    lineHeight: 20,
    color: Palette.text,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 110,
    maxHeight: 220,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Space.sm },
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 36, borderRadius: 18, borderWidth: 1, borderColor: Palette.hairline },
  label: { fontFamily: Font.ui, fontSize: 13, color: Palette.text },
  labelOn: { color: Palette.ground },
  dim: { opacity: 0.4 },
});

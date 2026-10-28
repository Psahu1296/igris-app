import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, sheetStyles } from '@/components/companion/bottom-sheet';
import { TypingIndicator } from '@/components/typing-indicator';
import { Meta } from '@/components/typography';
import { Font, Palette, Space, Type } from '@/constants/theme';
import { fetchPrefs, setPref, type PrefItem } from '@/lib/companion';
import type { Lane } from '@/lib/maestro';

const ANSWERS: { id: Exclude<PrefItem['answer'], ''>; label: string; color: string }[] = [
  { id: 'yes', label: 'Yes', color: '#34d399' },
  { id: 'maybe', label: 'Maybe', color: '#fbbf24' },
  { id: 'no', label: 'No', color: '#f87171' },
];

/**
 * His yes / no / maybe list (maestro companion/prefs.py). Her prompt holds his yeses and
 * maybes once things are warm; a no is held on the Mac: its cards, touches and dares are never
 * offered. Tapping the answer he already picked clears it.
 */
export function PrefsSheet({ lane, accent, onClose }: { lane: Lane; accent: string; onClose: () => void }) {
  const [items, setItems] = useState<PrefItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchPrefs(lane)
      .then((got) => live && setItems(got))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [lane]);

  const answer = (item: PrefItem, picked: PrefItem['answer']) => {
    void Haptics.selectionAsync();
    const next = item.answer === picked ? '' : picked;
    setItems((all) => all?.map((i) => (i.id === item.id ? { ...i, answer: next } : i)) ?? all);
    setPref(lane, item.id, next)
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <BottomSheet title="Yes · Maybe · No" error={error} onClose={onClose}>
      {items === null && !error ? (
        <View style={sheetStyles.empty}>
          <TypingIndicator color={accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={sheetStyles.list}>
          <Meta style={styles.lead}>Only you see this. Yes: she brings it in. Maybe: she asks first. No: never offered.</Meta>
          {items?.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.emoji}>{item.emoji}</Text>
              <View style={styles.words}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.about} numberOfLines={2}>
                  {item.about}
                </Text>
              </View>
              <View style={styles.answers}>
                {ANSWERS.map((a) => {
                  const on = item.answer === a.id;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => answer(item, a.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${item.title}: ${a.label}`}
                      style={[styles.answer, { borderColor: on ? a.color : Palette.hairline }, on && { backgroundColor: `${a.color}26` }]}>
                      <Text style={[styles.answerText, on && { color: a.color }]}>{a.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  lead: { color: Palette.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  emoji: { fontSize: 22, width: 30, textAlign: 'center' },
  words: { flex: 1, gap: 1 },
  title: { fontFamily: Font.uiMedium, color: Palette.text, ...Type.small },
  about: { fontFamily: Font.ui, color: Palette.muted, ...Type.micro },
  answers: { flexDirection: 'row', gap: 4 },
  answer: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  answerText: { fontFamily: Font.uiMedium, color: Palette.muted, ...Type.micro },
});

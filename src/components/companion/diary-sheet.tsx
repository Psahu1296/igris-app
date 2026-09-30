import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, sheetStyles } from '@/components/companion/bottom-sheet';
import { TypingIndicator } from '@/components/typing-indicator';
import { Meta } from '@/components/typography';
import { Font, Palette, Type } from '@/constants/theme';
import { fetchDiary, type DiaryEntry } from '@/lib/companion';
import type { Lane } from '@/lib/maestro';

const day = (iso: string) => {
  const at = new Date(`${iso}T12:00:00`);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
};

/**
 * Her diary (maestro companion/diary.py): one entry a night, written on the Mac after a
 * day the two of them talked, about what she felt and did not say.
 */
export function DiarySheet({ lane, name, accent, onClose }: { lane: Lane; name: string; accent: string; onClose: () => void }) {
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchDiary(lane)
      .then((got) => live && setEntries(got))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [lane]);

  return (
    <BottomSheet title={`${name}'s diary`} error={error} onClose={onClose}>
      {entries === null && !error ? (
        <View style={sheetStyles.empty}>
          <TypingIndicator color={accent} />
        </View>
      ) : entries?.length === 0 ? (
        <Meta style={sheetStyles.emptyText}>No entries yet. She writes one late at night, after a day you talked.</Meta>
      ) : (
        <ScrollView contentContainerStyle={sheetStyles.list}>
          {entries?.map((entry) => (
            <View key={entry.date} style={styles.entry}>
              <Meta style={{ color: accent }}>{day(entry.date)}</Meta>
              <Text style={styles.text}>{entry.text}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  entry: { gap: 4 },
  text: { fontFamily: Font.voiceItalic, color: Palette.text, ...Type.ask },
});

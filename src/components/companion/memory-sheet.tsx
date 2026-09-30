import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, sheetStyles } from '@/components/companion/bottom-sheet';
import { PressableScale } from '@/components/pressable-scale';
import { TypingIndicator } from '@/components/typing-indicator';
import { Meta } from '@/components/typography';
import { Font, Palette, Space, Type } from '@/constants/theme';
import { fetchMemory, forgetMemory, type CompanionMemory } from '@/lib/companion';
import type { Lane } from '@/lib/maestro';

const KIND: Record<CompanionMemory['kind'], string> = { fact: 'Knows', episode: 'Happened', reflection: 'Thinks' };

/**
 * What she has written down about the two of them (maestro companion/memory.py): the
 * Mac reads the chat in the background and keeps what is worth remembering. Shown so he
 * can see why she brings something up, and take out what she got wrong.
 */
export function MemorySheet({ lane, name, accent, onClose }: { lane: Lane; name: string; accent: string; onClose: () => void }) {
  const [items, setItems] = useState<CompanionMemory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchMemory(lane)
      .then((got) => live && setItems(got))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [lane]);

  const forget = (item: CompanionMemory) => {
    const before = items;
    setItems((all) => all?.filter((i) => i !== item) ?? null);
    forgetMemory(lane, item).catch((e: unknown) => {
      setItems(before);
      setError(e instanceof Error ? e.message : String(e));
    });
  };

  return (
    <BottomSheet title={`What ${name} remembers`} error={error} onClose={onClose}>
      {items === null && !error ? (
        <View style={sheetStyles.empty}>
          <TypingIndicator color={accent} />
        </View>
      ) : items?.length === 0 ? (
        <Meta style={sheetStyles.emptyText}>
          Nothing yet. She writes things down after every 16 messages or so, on the Mac, while you talk.
        </Meta>
      ) : (
        <ScrollView contentContainerStyle={sheetStyles.list}>
          {items?.map((item, i) => (
            <View key={`${item.at}-${i}`} style={styles.item}>
              <View style={styles.itemText}>
                <Meta style={{ color: accent }}>{KIND[item.kind] ?? item.kind}</Meta>
                <Text style={styles.text}>{item.text}</Text>
              </View>
              <PressableScale
                onPress={() => forget(item)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Make her forget this"
                style={styles.forget}>
                <X size={13} color={Palette.muted} />
              </PressableScale>
            </View>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.sm },
  itemText: { flex: 1, gap: 2 },
  text: { fontFamily: Font.ui, color: Palette.text, ...Type.small },
  forget: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Palette.hairline },
});

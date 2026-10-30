import { Check, Pencil, Plus, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet, sheetStyles } from '@/components/companion/bottom-sheet';
import { PressableScale } from '@/components/pressable-scale';
import { TypingIndicator } from '@/components/typing-indicator';
import { Meta } from '@/components/typography';
import { Font, Palette, Space, Type } from '@/constants/theme';
import { correctMemory, fetchMemoryLayers, forgetMemoryId, rememberThis, type MemoryRow, type MemorySection } from '@/lib/companion';
import type { Lane } from '@/lib/maestro';

/** Days a plan can be set for, from today (the phone's own date: it is in India like the Mac). */
const WHEN: { label: string; days: number | null }[] = [
  { label: 'No date', days: null },
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
];

function dayFrom(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Her memory, layer by layer (maestro companion/memorypage.py): who he is, what she holds with
 * care, plans, how she remembers each day and week, their firsts, and the rest. A row of hers
 * can be corrected (his words then outrank her guesses) or forgotten; day lines and firsts are
 * shown only. He can also tell her something to remember, with a day for a plan.
 * Titles and notes come from the Mac: this repo is public, so it renders by kind only.
 */
export function MemorySheet({ lane, name, accent, onClose }: { lane: Lane; name: string; accent: string; onClose: () => void }) {
  const [sections, setSections] = useState<MemorySection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [when, setWhen] = useState<number | null>(null);

  const load = useCallback(() => {
    fetchMemoryLayers(lane)
      .then((got) => (got === null ? setError("This Mac's maestro is too old for her memory page.") : setSections(got)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [lane]);

  useEffect(load, [load]);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const forget = (row: MemoryRow) => {
    const before = sections;
    setSections((all) => all?.map((s) => ({ ...s, rows: s.rows.filter((r) => r !== row) })).filter((s) => s.rows.length) ?? null);
    forgetMemoryId(lane, row.id).catch((e: unknown) => {
      setSections(before);
      fail(e);
    });
  };

  const save = () => {
    if (!editing || editing.text.trim().length < 8) return;
    const { id, text } = editing;
    setEditing(null);
    correctMemory(lane, id, text.trim())
      .then((fixed) => setSections((all) => all?.map((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...fixed, note: r.note } : r)) })) ?? null))
      .catch(fail);
  };

  const add = () => {
    const text = draft.trim();
    if (text.length < 8) {
      setError('A few more words, so she knows what it is.');
      return;
    }
    rememberThis(lane, text, when === null ? '' : dayFrom(when))
      .then(() => {
        setDraft('');
        setWhen(null);
        setAdding(false);
        setError(null);
        load();
      })
      .catch(fail);
  };

  return (
    <BottomSheet title={`What ${name} remembers`} error={error} onClose={onClose}>
      {sections === null && !error ? (
        <View style={sheetStyles.empty}>
          <TypingIndicator color={accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={sheetStyles.list} keyboardShouldPersistTaps="handled">
          {adding ? (
            <View style={styles.add}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="What she should remember (his interview on Friday…)"
                placeholderTextColor={Palette.faint}
                style={styles.input}
                multiline
                autoFocus
                accessibilityLabel="What she should remember"
              />
              <View style={styles.chips}>
                {WHEN.map((w) => (
                  <PressableScale
                    key={w.label}
                    onPress={() => setWhen(w.days)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: when === w.days }}
                    style={[styles.chip, when === w.days ? { backgroundColor: accent, borderColor: accent } : null]}>
                    <Text style={[styles.chipText, when === w.days ? styles.chipTextOn : null]}>{w.label}</Text>
                  </PressableScale>
                ))}
              </View>
              <View style={styles.addActions}>
                <PressableScale onPress={() => setAdding(false)} accessibilityRole="button" style={styles.button}>
                  <Text style={styles.chipText}>Cancel</Text>
                </PressableScale>
                <PressableScale onPress={add} accessibilityRole="button" style={[styles.button, { backgroundColor: accent, borderColor: accent }]}>
                  <Text style={[styles.chipText, styles.chipTextOn]}>Remember</Text>
                </PressableScale>
              </View>
            </View>
          ) : (
            <PressableScale onPress={() => setAdding(true)} accessibilityRole="button" style={styles.addButton}>
              <Plus size={14} color={accent} />
              <Text style={[styles.chipText, { color: accent }]}>Tell her to remember something</Text>
            </PressableScale>
          )}
          {sections?.length === 0 ? (
            <Meta style={sheetStyles.emptyText}>
              Nothing yet. She writes things down after every 16 messages or so, on the Mac, while you talk.
            </Meta>
          ) : null}
          {sections?.map((section) => (
            <View key={section.key} style={styles.section}>
              <Text style={styles.title}>{section.title}</Text>
              <Meta>{section.about}</Meta>
              {section.rows.map((row, i) =>
                editing && row.id && editing.id === row.id ? (
                  <View key={row.id} style={styles.item}>
                    <TextInput
                      value={editing.text}
                      onChangeText={(text) => setEditing({ id: row.id, text })}
                      style={[styles.input, styles.itemText]}
                      multiline
                      autoFocus
                      accessibilityLabel="Your wording"
                    />
                    <PressableScale onPress={save} hitSlop={10} accessibilityRole="button" accessibilityLabel="Save" style={styles.icon}>
                      <Check size={13} color={accent} />
                    </PressableScale>
                    <PressableScale onPress={() => setEditing(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel" style={styles.icon}>
                      <X size={13} color={Palette.muted} />
                    </PressableScale>
                  </View>
                ) : (
                  <View key={row.id || `${section.key}-${row.at}-${i}`} style={styles.item}>
                    <View style={styles.itemText}>
                      {row.note ? <Meta style={{ color: accent }}>{row.mine ? `${row.note} · your words` : row.note}</Meta> : null}
                      <Text style={styles.text}>{row.text}</Text>
                    </View>
                    {row.id ? (
                      <>
                        <PressableScale
                          onPress={() => setEditing({ id: row.id, text: row.text })}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel="Correct this"
                          style={styles.icon}>
                          <Pencil size={12} color={Palette.muted} />
                        </PressableScale>
                        <PressableScale onPress={() => forget(row)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Make her forget this" style={styles.icon}>
                          <X size={13} color={Palette.muted} />
                        </PressableScale>
                      </>
                    ) : null}
                  </View>
                ),
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: { gap: Space.sm, marginTop: Space.sm },
  title: { fontFamily: Font.ui, color: Palette.text, fontSize: 15, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.sm },
  itemText: { flex: 1, gap: 2 },
  text: { fontFamily: Font.ui, color: Palette.text, ...Type.small },
  icon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Palette.hairline },
  add: { gap: Space.sm },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  addActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  chip: { paddingHorizontal: 12, height: 30, borderRadius: 15, borderWidth: 1, borderColor: Palette.hairline, justifyContent: 'center' },
  button: { paddingHorizontal: 16, height: 34, borderRadius: 17, borderWidth: 1, borderColor: Palette.hairline, justifyContent: 'center' },
  chipText: { fontFamily: Font.ui, fontSize: 13, color: Palette.text },
  chipTextOn: { color: Palette.ground },
  input: {
    fontFamily: Font.ui,
    fontSize: 14,
    color: Palette.text,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 110,
  },
});

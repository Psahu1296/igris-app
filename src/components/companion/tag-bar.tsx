import { X } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Meta } from '@/components/typography';
import { Font, Gutter, Palette, Space, Type } from '@/constants/theme';
import type { MessageTag, TagPart } from '@/lib/companion';

/**
 * The tag chips above the composer (maestro companion/tags.py): what he writes is wrapped in the tag he
 * picks, so the model knows which part is his action, her look, how she should react, what he feels.
 * Tap a chip with text in the box: that text becomes a part and the box empties for the next one. Tap
 * it with an empty box: it is armed, and what he types next is wrapped when he sends. The armed tag's
 * presets are one tap each. Every word comes from the Mac; this only knows chips.
 */
export function TagBar({
  tags,
  parts,
  armed,
  accent,
  disabled,
  onTag,
  onPreset,
  onRemove,
}: {
  tags: MessageTag[];
  parts: TagPart[];
  armed: MessageTag | null;
  accent: string;
  disabled?: boolean;
  onTag: (tag: MessageTag) => void;
  onPreset: (tag: MessageTag, text: string) => void;
  onRemove: (index: number) => void;
}) {
  if (!tags.length) return null;
  return (
    <View style={styles.bar}>
      {parts.length ? (
        <View style={styles.parts}>
          {parts.map((p, i) => (
            <PressableScale
              key={`${p.tag.id}-${i}`}
              onPress={() => onRemove(i)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${p.tag.label}: ${p.text}`}
              style={[styles.part, { borderColor: accent }]}>
              <Text style={[styles.partLabel, { color: accent }]}>{p.tag.label}</Text>
              <Text style={styles.partText} numberOfLines={1}>
                {p.text}
              </Text>
              <X size={12} color={Palette.muted} />
            </PressableScale>
          ))}
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {tags.map((t) => {
          const on = armed?.id === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => onTag(t)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t.label}: ${t.hint}`}
              style={[styles.chip, { borderColor: on ? accent : Palette.hairline, opacity: disabled ? 0.4 : 1 }, on && { backgroundColor: `${accent}26` }]}>
              <Text style={[styles.chipText, on && { color: accent }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {armed ? (
        <View style={styles.armed}>
          <Meta>{armed.hint} Type it, or tap one:</Meta>
          {armed.presets.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              {armed.presets.map((text) => (
                <Pressable
                  key={text}
                  onPress={() => onPreset(armed, text)}
                  accessibilityRole="button"
                  accessibilityLabel={`${armed.label}: ${text}`}
                  style={styles.preset}>
                  <Text style={styles.presetText}>{text}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: Space.xs, paddingTop: Space.sm, borderTopWidth: 1, borderTopColor: Palette.hairline },
  chips: { gap: Space.sm, paddingHorizontal: Gutter - 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipText: { fontFamily: Font.uiMedium, color: Palette.muted, ...Type.small },
  armed: { gap: Space.xs, paddingBottom: 2 },
  preset: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.hairline },
  presetText: { fontFamily: Font.ui, color: Palette.text, ...Type.micro },
  parts: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.xs, paddingHorizontal: Gutter - 6 },
  part: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  partLabel: { fontFamily: Font.uiMedium, ...Type.micro },
  partText: { flexShrink: 1, fontFamily: Font.ui, color: Palette.text, ...Type.micro },
});

import { Brain, Camera, ImagePlus } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Font, Gutter, Palette, Space } from '@/constants/theme';
import { MY_EMOTES, type CompanionScene } from '@/lib/companion';

/**
 * The tray above the message box, opened by the smile button: what he can do besides
 * typing. Top row: send her a photo, see what she remembers, then the scenes and games
 * the Mac lists (maestro companion/scenes.py; none on an older maestro). Bottom row: his
 * own actions (*hugs you*), added to the draft.
 */
export function CompanionTray({
  scenes,
  busy,
  accent,
  onEmote,
  onScene,
  onPhoto,
  onMemory,
}: {
  scenes: CompanionScene[];
  /** She is answering: nothing that starts a turn can be tapped. */
  busy: boolean;
  accent: string;
  onEmote: (emote: string) => void;
  onScene: (scene: CompanionScene) => void;
  onPhoto: (source: 'camera' | 'library') => void;
  onMemory: () => void;
}) {
  return (
    <View style={styles.tray}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.row}>
        <PressableScale
          onPress={() => onPhoto('library')}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Send her a photo from the gallery"
          style={[styles.chip, styles.iconChip, busy ? styles.off : null]}>
          <ImagePlus size={14} color={accent} />
          <Text style={styles.chipText}>Photo</Text>
        </PressableScale>
        <PressableScale
          onPress={() => onPhoto('camera')}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Take a photo and send it to her"
          style={[styles.chip, styles.iconChip, busy ? styles.off : null]}>
          <Camera size={14} color={accent} />
          <Text style={styles.chipText}>Camera</Text>
        </PressableScale>
        <PressableScale
          onPress={onMemory}
          accessibilityRole="button"
          accessibilityLabel="What she remembers"
          style={[styles.chip, styles.iconChip]}>
          <Brain size={14} color={accent} />
          <Text style={styles.chipText}>Memory</Text>
        </PressableScale>
        {scenes.map((scene) => (
          <PressableScale
            key={scene.id}
            onPress={() => onScene(scene)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Start ${scene.kind === 'game' ? 'the game' : 'the scene'}: ${scene.title}`}
            style={[styles.chip, { borderColor: accent }, busy ? styles.off : null]}>
            <Text style={styles.chipText}>{scene.title}</Text>
          </PressableScale>
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.row}>
        {MY_EMOTES.map((emote) => (
          <PressableScale
            key={emote}
            onPress={() => onEmote(emote)}
            accessibilityRole="button"
            accessibilityLabel={`Add: ${emote}`}
            style={styles.chip}>
            <Text style={styles.emoteText}>{emote}</Text>
          </PressableScale>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits on the message box like a keyboard's suggestion rows.
  tray: { borderTopWidth: 1, borderTopColor: Palette.hairline, paddingVertical: Space.xs },
  row: { gap: Space.sm, paddingHorizontal: Gutter - 6, paddingVertical: Space.xs },
  chip: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  iconChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  off: { opacity: 0.4 },
  chipText: { fontFamily: Font.ui, fontSize: 13, color: Palette.text },
  emoteText: { fontFamily: Font.voiceItalic, fontSize: 14, color: Palette.text },
});

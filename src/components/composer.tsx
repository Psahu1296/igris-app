import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Font, laneColor, Palette, Space, Type } from '@/constants/theme';
import type { Lane } from '@/lib/maestro';

export function Composer({
  lane,
  busy,
  onSend,
}: {
  lane: Lane;
  busy: boolean;
  onSend: (message: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const ready = draft.trim().length > 0 && !busy;

  const send = () => {
    if (!ready) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(draft.trim());
    setDraft('');
  };

  return (
    <View style={styles.bar}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Ask Igris"
        placeholderTextColor={Palette.faint}
        style={styles.input}
        multiline
        maxLength={2000}
        editable={!busy}
        onSubmitEditing={send}
        returnKeyType="send"
        submitBehavior="submit"
      />
      <Pressable
        onPress={send}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityLabel="Ask Igris"
        style={[
          styles.button,
          { backgroundColor: ready ? laneColor(lane) : Palette.surfaceLift },
        ]}>
        <Text style={[styles.buttonLabel, { color: ready ? Palette.ground : Palette.faint }]}>
          Ask
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Palette.hairline,
    backgroundColor: Palette.ground,
  },
  input: {
    flex: 1,
    maxHeight: 140,
    color: Palette.text,
    fontFamily: Font.ui,
    ...Type.ask,
    paddingVertical: Space.sm,
  },
  button: {
    paddingHorizontal: Space.lg,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { fontFamily: Font.uiMedium, ...Type.small },
});

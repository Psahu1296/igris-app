import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Font, Gutter, laneColor, Palette, Space, Type } from '@/constants/theme';
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
  const [focused, setFocused] = useState(false);
  const ready = draft.trim().length > 0 && !busy;
  const accent = laneColor(lane);

  const send = () => {
    if (!ready) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSend(draft.trim());
    setDraft('');
  };

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.container,
          {
            borderColor: focused ? accent : Palette.hairline,
            backgroundColor: focused ? Palette.surfaceLift : Palette.surfaceGlass,
          },
        ]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Ask Igris..."
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
            {
              backgroundColor: ready ? accent : Palette.surfaceLift,
              shadowColor: ready ? accent : 'transparent',
            },
          ]}>
          <Text style={[styles.buttonLabel, { color: ready ? Palette.ground : Palette.faint }]}>
            {busy ? '…' : 'Ask'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: Gutter,
    paddingTop: Space.xs,
    paddingBottom: Space.md,
    backgroundColor: Palette.ground,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.xs,
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 52,
  },
  input: {
    flex: 1,
    maxHeight: 120,
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
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonLabel: {
    fontFamily: Font.uiMedium,
    letterSpacing: 0.5,
    ...Type.small,
  },
});


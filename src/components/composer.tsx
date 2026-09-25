import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Camera, ImagePlus, Loader2, Mic, Send, Square, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, ToastAndroid, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AudioWave } from '@/components/audio-wave';
import { PressableScale } from '@/components/pressable-scale';
import { Font, Gutter, laneColor, Palette, Space, Type } from '@/constants/theme';
import type { Lane, Photo } from '@/lib/maestro';
import { pickPhoto } from '@/lib/photo';
import type { ListenState } from '@/lib/voice/use-listening';
import { useSession } from '@/state/session';

/** What the composer needs from useListening. Absent means the mic is not offered. */
export type VoiceControls = {
  available: boolean;
  state: ListenState;
  start: () => void;
  stop: () => void;
};

export function Composer({
  lane,
  busy,
  onSend,
  voice,
}: {
  lane: Lane;
  busy: boolean;
  onSend: (message: string, photo?: Photo) => void;
  voice?: VoiceControls;
}) {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  // A photo waiting to go with the next message, and whether Camera/Gallery is open.
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [picking, setPicking] = useState(false);
  const listening = voice?.state === 'listening';
  const transcribing = voice?.state === 'transcribing';
  const micBusy = listening || transcribing;
  const ready = (draft.trim().length > 0 || photo !== null) && !busy;
  // Photos are read by gemma4 on the Mac; Render has no vision model (maestro vision.py).
  const canSee = lane === 'local';
  // Accent follows the mode (Auto / pinned), not the lane — see Tint in theme.ts.
  const { lanePref } = useSession();
  const accent = laneColor(lanePref);

  // Animated glow aura for mic when listening
  const micPulse = useSharedValue(1);

  useEffect(() => {
    if (listening) {
      micPulse.value = withRepeat(
        withSequence(
          withTiming(1.25, { duration: 700 }),
          withTiming(1, { duration: 700 })
        ),
        -1,
        true
      );
    } else {
      micPulse.value = withTiming(1, { duration: 300 });
    }
  }, [listening, micPulse]);

  const micAuraStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micPulse.value }],
    opacity: listening ? 0.35 : 0,
  }));

  const send = () => {
    if (!ready) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSend(draft.trim(), photo ?? undefined);
    setDraft('');
    setPhoto(null);
  };

  const attach = () => {
    if (!canSee) {
      ToastAndroid.show('Photos need the Mac. Igris is on Render right now.', ToastAndroid.LONG);
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPicking((open) => !open);
  };

  const choose = async (source: 'camera' | 'library') => {
    setPicking(false);
    try {
      const picked = await pickPhoto(source);
      if (picked) setPhoto(picked);
    } catch (err) {
      ToastAndroid.show(err instanceof Error ? err.message : 'Could not open the camera.', ToastAndroid.LONG);
    }
  };

  return (
    <View style={styles.wrapper}>
      {picking ? (
        <View style={styles.pickRow}>
          <PressableScale
            onPress={() => void choose('camera')}
            accessibilityRole="button"
            accessibilityLabel="Take a photo"
            style={[styles.pickChip, { borderColor: accent + '66' }]}>
            <Camera size={16} color={accent} />
            <Text style={styles.pickText}>Camera</Text>
          </PressableScale>
          <PressableScale
            onPress={() => void choose('library')}
            accessibilityRole="button"
            accessibilityLabel="Choose a photo or screenshot"
            style={[styles.pickChip, { borderColor: accent + '66' }]}>
            <ImagePlus size={16} color={accent} />
            <Text style={styles.pickText}>Gallery</Text>
          </PressableScale>
          <Text style={styles.pickHint}>Ask about it, or say “scan this bill”.</Text>
        </View>
      ) : null}

      {photo ? (
        <View style={styles.photoRow}>
          <Image source={{ uri: photo.uri }} style={styles.thumb} contentFit="cover" />
          <PressableScale
            onPress={() => setPhoto(null)}
            accessibilityRole="button"
            accessibilityLabel="Remove the photo"
            style={styles.thumbRemove}>
            <X size={12} color={Palette.text} />
          </PressableScale>
          <Text style={styles.pickHint}>
            {canSee ? 'Send as it is for “what’s this?”' : 'Photos need the Mac. Remove it to send.'}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.container,
          {
            borderColor: focused ? accent : Palette.hairline,
            backgroundColor: focused ? Palette.surfaceLift : Palette.surfaceGlass,
            shadowColor: focused ? accent : 'transparent',
          },
        ]}>
        {/* Live Audio Waveform when listening */}
        {listening ? (
          <View style={styles.listeningWaveContainer}>
            <AudioWave active={listening} color={accent} barCount={5} height={20} />
          </View>
        ) : null}

        {!micBusy ? (
          <PressableScale
            onPress={attach}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={canSee ? 'Attach a photo' : 'Photos need the Mac'}
            style={[styles.attach, { opacity: canSee ? 1 : 0.4 }]}>
            <ImagePlus size={20} color={picking || photo ? accent : Palette.muted} />
          </PressableScale>
        ) : null}

        <TextInput
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={
            listening
              ? 'Listening to voice…'
              : transcribing
                ? 'Transcribing audio…'
                : photo
                  ? 'Ask about the photo…'
                  : 'Ask Igris...'
          }
          placeholderTextColor={Palette.faint}
          style={styles.input}
          multiline
          maxLength={2000}
          editable={!busy && !micBusy}
          onSubmitEditing={send}
          returnKeyType="send"
          submitBehavior="submit"
        />

        {/* Mic Control Button */}
        {voice?.available && !ready ? (
          <View style={styles.micWrapper}>
            {/* Glowing Aura Ring when listening */}
            <Animated.View
              style={[
                styles.micAura,
                { backgroundColor: accent, shadowColor: accent },
                micAuraStyle,
              ]}
            />
            <PressableScale
              onPress={() => (micBusy ? voice.stop() : voice.start())}
              disabled={busy || transcribing}
              accessibilityRole="button"
              accessibilityLabel={listening ? 'Stop listening' : 'Speak to Igris'}
              accessibilityState={{ busy: micBusy }}
              style={[
                styles.button,
                styles.iconButton,
                {
                  backgroundColor: micBusy ? accent : Palette.surfaceLift,
                  borderColor: micBusy ? accent : Palette.hairline,
                },
              ]}>
              {transcribing ? (
                <Loader2 size={18} color={Palette.ground} style={styles.spinner} />
              ) : listening ? (
                <Square size={16} color={Palette.ground} fill={Palette.ground} />
              ) : (
                <Mic size={18} color={Palette.text} />
              )}
            </PressableScale>
          </View>
        ) : null}

        {/* Send Button */}
        <PressableScale
          onPress={send}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel="Ask Igris"
          style={[
            styles.button,
            ready ? styles.sendReady : styles.sendDisabled,
            {
              backgroundColor: ready ? accent : Palette.surfaceLift,
              borderColor: ready ? accent : Palette.hairline,
            },
          ]}>
          {busy ? (
            <Loader2 size={16} color={Palette.ground} style={styles.spinner} />
          ) : (
            <Send size={16} color={ready ? Palette.ground : Palette.faint} />
          )}
        </PressableScale>
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
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 54,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  listeningWaveContainer: {
    paddingLeft: Space.xs,
    paddingRight: Space.xs,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    color: Palette.text,
    fontFamily: Font.ui,
    ...Type.ask,
    paddingVertical: Space.sm,
  },
  micWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micAura: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 6,
  },
  button: {
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconButton: {
    width: 40,
    paddingHorizontal: 0,
  },
  sendReady: {
    width: 40,
    paddingHorizontal: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  sendDisabled: {
    width: 40,
    paddingHorizontal: 0,
  },
  attach: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Space.sm,
    paddingBottom: Space.sm,
  },
  pickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: Palette.surfaceLift,
  },
  pickText: {
    color: Palette.text,
    fontFamily: Font.ui,
    fontSize: 14,
  },
  pickHint: {
    flexShrink: 1,
    color: Palette.faint,
    fontFamily: Font.ui,
    fontSize: 12,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingBottom: Space.sm,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  thumbRemove: {
    position: 'absolute',
    left: 44,
    top: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceLift,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  spinner: {
    transform: [{ rotate: '0deg' }],
  },
});

import { Pause, Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Font, Palette, Space, Type } from '@/constants/theme';
import { spoken } from '@/lib/companion-voice';

const BARS = 28;

/** Bar heights from her words, so the same note always has the same shape. */
function shape(text: string): number[] {
  let seed = 7;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
  return Array.from({ length: BARS }, (_, i) => {
    seed = (seed * 37 + i * 11) % 9973;
    return 0.25 + (seed % 75) / 100;
  });
}

/**
 * Her voice note (maestro companion/voicenote.py): a bubble with a play button and a waveform,
 * played in her voice on the phone (companion-voice.ts). The words are a tap away, like a transcript.
 */
export function VoiceNote({
  text,
  accent,
  playing,
  onPlay,
  onLongPress,
}: {
  text: string;
  accent: string;
  playing: boolean;
  onPlay: () => void;
  onLongPress?: () => void;
}) {
  const [shown, setShown] = useState(false);
  const words = spoken(text);
  const seconds = Math.max(2, Math.round(words.split(/\s+/).length / 2.4));
  const bars = shape(text);
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = playing ? withRepeat(withTiming(0.45, { duration: 380 }), -1, true) : withTiming(1);
  }, [playing, pulse]);
  const waveStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Pressable onLongPress={onLongPress} delayLongPress={400} style={styles.bubble}>
      <View style={styles.row}>
        <Pressable
          onPress={onPlay}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Stop her voice note' : 'Play her voice note'}
          style={[styles.play, { backgroundColor: accent }]}>
          {playing ? <Pause size={16} color={Palette.ground} /> : <Play size={16} color={Palette.ground} />}
        </Pressable>
        <Animated.View style={[styles.wave, waveStyle]}>
          {bars.map((h, i) => (
            <View key={i} style={[styles.bar, { height: 4 + h * 22, backgroundColor: playing ? accent : Palette.muted }]} />
          ))}
        </Animated.View>
        <Text style={styles.time}>{`0:${String(seconds).padStart(2, '0')}`}</Text>
      </View>
      <Pressable onPress={() => setShown((s) => !s)} hitSlop={6}>
        <Text style={styles.toggle}>{shown ? text : 'Show words'}</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '82%',
    minWidth: 230,
    gap: 6,
    padding: Space.sm,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  play: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 },
  bar: { flex: 1, borderRadius: 2 },
  time: { fontFamily: Font.uiMedium, color: Palette.muted, ...Type.micro },
  toggle: { fontFamily: Font.ui, color: Palette.muted, ...Type.micro, paddingHorizontal: 4 },
});

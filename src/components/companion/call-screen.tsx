/* eslint-disable react-hooks/immutability -- Reanimated shared values are written in effects, as in touch-button.tsx */
import * as Haptics from 'expo-haptics';
import { Mic, MicOff, PhoneOff } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { DrawnPicture } from '@/components/cards/drawn-picture';
import { Font, Palette, Space, Type } from '@/constants/theme';
import { hush, say } from '@/lib/companion-voice';
import { streamCompanion } from '@/lib/companion';
import type { Lane } from '@/lib/maestro';

type Phase = 'listening' | 'thinking' | 'speaking' | 'muted';
const SAYS: Record<Phase, string> = {
  listening: 'listening…',
  thinking: 'thinking…',
  speaking: 'speaking',
  muted: 'muted',
};

/** The clock, read in a handler (a module function: the React rules flag Date.now in a component). */
const nowMs = () => Date.now();

/**
 * A voice call with her: hands-free turns. He speaks (useListening: Whisper on the Mac, the phone's
 * recogniser otherwise), the words go to maestro as a call turn (POST /companion/stream {call}), her
 * answer is said in her voice on the phone (companion-voice.ts), then it listens again. Every turn is
 * an ordinary message of the chat, so hanging up shows the call written out.
 */
export function CallScreen({
  lane,
  name,
  face,
  accent,
  listen,
  stopListening,
  onEnd,
}: {
  lane: Lane;
  name: string;
  face: string | null;
  accent: string;
  listen: (onText: (text: string) => void) => Promise<void>;
  stopListening: () => Promise<void>;
  onEnd: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('listening');
  const [heard, setHeard] = useState('');
  const [seconds, setSeconds] = useState(0);
  const open = useRef(true);
  const muted = useRef(false);
  const started = useRef(nowMs());
  const ring = useSharedValue(0);

  useEffect(() => {
    ring.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
  }, [ring]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - ring.value), transform: [{ scale: 1 + ring.value * 0.35 }] }));

  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.floor((nowMs() - started.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const turn = useCallback(
    async (text: string) => {
      if (!open.current) return;
      setHeard(text);
      setPhase('thinking');
      let reply = '';
      try {
        await streamCompanion({
          lane,
          message: text,
          call: true,
          onEvent: (event) => {
            if (event.kind === 'reply') reply = event.text;
          },
        });
      } catch {
        reply = '';
      }
      if (!open.current) return;
      if (reply) {
        setPhase('speaking');
        await say(reply);
      }
      if (!open.current) return;
      if (muted.current) {
        setPhase('muted');
        return;
      }
      setPhase('listening');
      void listen(turn);
    },
    [lane, listen]
  );

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void listen(turn);
    return () => {
      open.current = false;
    };
  }, [listen, turn]);

  const hangUp = () => {
    open.current = false;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    hush();
    void stopListening();
    onEnd();
  };

  const toggleMute = () => {
    muted.current = !muted.current;
    void Haptics.selectionAsync();
    if (muted.current) {
      if (phase === 'listening') void stopListening();
      setPhase('muted');
    } else if (phase === 'muted') {
      setPhase('listening');
      void listen(turn);
    }
  };

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <Modal visible animationType="fade" onRequestClose={hangUp}>
      <View style={styles.screen}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.clock}>{clock}</Text>
        <View style={styles.faceWrap}>
          {phase === 'speaking' || phase === 'listening' ? (
            <Animated.View style={[styles.ring, { borderColor: accent }, ringStyle]} />
          ) : null}
          <View style={[styles.face, { borderColor: accent }]}>
            {face ? <DrawnPicture lane={lane} picture={{ name: face, prompt: name }} aspect={1} /> : <Text style={styles.initial}>{name[0]}</Text>}
          </View>
        </View>
        <Text style={[styles.phase, { color: accent }]}>{SAYS[phase]}</Text>
        <Text style={styles.heard} numberOfLines={2}>
          {heard ? `“${heard}”` : 'Say something — she is listening.'}
        </Text>
        <View style={styles.buttons}>
          <Pressable onPress={toggleMute} accessibilityRole="button" accessibilityLabel={phase === 'muted' ? 'Unmute' : 'Mute'} style={styles.round}>
            {phase === 'muted' ? <MicOff size={26} color={Palette.text} /> : <Mic size={26} color={Palette.text} />}
          </Pressable>
          <Pressable onPress={hangUp} accessibilityRole="button" accessibilityLabel="Hang up" style={[styles.round, styles.hang]}>
            <PhoneOff size={26} color="#fff" />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const FACE = 168;

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.md, backgroundColor: Palette.ground, padding: Space.xl },
  name: { fontFamily: Font.uiMedium, color: Palette.text, fontSize: 26 },
  clock: { fontFamily: Font.ui, color: Palette.muted, ...Type.small },
  faceWrap: { width: FACE + 40, height: FACE + 40, alignItems: 'center', justifyContent: 'center', marginVertical: Space.lg },
  ring: { position: 'absolute', width: FACE + 30, height: FACE + 30, borderRadius: (FACE + 30) / 2, borderWidth: 3 },
  face: { width: FACE, height: FACE, borderRadius: FACE / 2, overflow: 'hidden', borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.surface },
  initial: { fontFamily: Font.uiMedium, color: Palette.text, fontSize: 64 },
  phase: { fontFamily: Font.uiMedium, ...Type.small, letterSpacing: 1 },
  heard: { fontFamily: Font.voiceItalic, color: Palette.muted, ...Type.small, textAlign: 'center', minHeight: 40 },
  buttons: { flexDirection: 'row', gap: Space.xl * 2, marginTop: Space.xl },
  round: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.surface },
  hang: { backgroundColor: '#e11d48' },
});

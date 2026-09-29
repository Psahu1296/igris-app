import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ArrowUp, ChevronLeft, Heart, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { TypingIndicator } from '@/components/typing-indicator';
import { Meta, Title } from '@/components/typography';
import { Font, Gutter, Palette, Space, Type } from '@/constants/theme';
import {
  fetchCompanion,
  forgetCompanion,
  streamCompanion,
  type CompanionMessage,
} from '@/lib/companion';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import { useSession } from '@/state/session';

/**
 * The owner's private companion chat (lib/companion.ts). A messaging app, not an Igris
 * transcript: bubbles, her words appearing as she types, one endless conversation. Mac
 * only, because her model is local.
 */
export default function CompanionScreen() {
  const { lane } = useSession();
  const [name, setName] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [messages, setMessages] = useState<CompanionMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // Her reply in flight: null = idle, '' = typing, text = words so far.
  const [live, setLive] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const lastSend = useRef(0);
  const scroller = useRef<ScrollView>(null);
  const bottomInset = useKeyboardInset();

  useEffect(() => {
    if (lane !== 'local') return;
    let alive = true;
    fetchCompanion(lane)
      .then((c) => {
        if (!alive) return;
        setName(c.name);
        setModel(c.model);
        setMessages(c.messages);
      })
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [lane]);

  const send = useCallback(async () => {
    const text = draft.trim();
    // The same double-submit guard as the composer: one Enter can fire submit twice.
    const now = Date.now();
    if (!text || live !== null || now - lastSend.current < 800) return;
    lastSend.current = now;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDraft('');
    setSendError(null);
    const at = new Date().toISOString();
    setMessages((m) => [...m, { role: 'you', text, at }]);
    setLive('');
    let words = '';
    try {
      await streamCompanion({
        lane,
        message: text,
        onEvent: (event) => {
          if (event.kind === 'token') {
            words += event.text;
            setLive(words);
          } else if (event.kind === 'reply') {
            setMessages((m) => [...m, { role: 'her', text: event.text, at: new Date().toISOString() }]);
            setLive(null);
          }
        },
      });
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
      // Not saved on the Mac either: put the words back so they can be sent again.
      setMessages((m) => m.filter((msg) => msg.at !== at));
      setDraft(text);
    } finally {
      setLive(null);
    }
  }, [draft, live, lane]);

  const forget = () =>
    Alert.alert(`Clear everything with ${name}?`, 'The whole chat is deleted from the Mac. She will not remember it.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () =>
          void forgetCompanion(lane)
            .then(() => setMessages([]))
            .catch((e: unknown) => setSendError(e instanceof Error ? e.message : String(e))),
      },
    ]);

  const busy = live !== null;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={[styles.fill, { paddingBottom: bottomInset }]}>
        <View style={styles.header}>
          <PressableScale
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.iconButton}>
            <ChevronLeft size={18} color={Palette.text} />
          </PressableScale>
          <View style={styles.avatar}>
            <Heart size={16} color={ROSE} fill={ROSE} />
          </View>
          <View style={styles.headerText}>
            <Title style={styles.name}>{name ?? ' '}</Title>
            <Meta numberOfLines={1}>{busy ? 'typing…' : model ? `on ${model}` : ' '}</Meta>
          </View>
          {messages.length > 0 ? (
            <PressableScale
              onPress={forget}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear the chat"
              style={styles.iconButton}>
              <Trash2 size={15} color={Palette.muted} />
            </PressableScale>
          ) : null}
        </View>

        {lane !== 'local' ? (
          <Centered text="She lives on the Mac. Switch the lane to the Mac to talk to her." />
        ) : loadError ? (
          <Centered text={loadError} />
        ) : name === null ? (
          <View style={styles.centered}>
            <TypingIndicator color={ROSE} />
          </View>
        ) : (
          <ScrollView
            ref={scroller}
            style={styles.fill}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
            onLayout={() => scroller.current?.scrollToEnd({ animated: false })}
            keyboardDismissMode="none">
            {messages.length === 0 && !busy ? (
              <Meta style={styles.hello}>Say hi to {name}. Only you can see this chat; it stays on the Mac.</Meta>
            ) : null}
            {messages.map((m, i) => (
              <Bubble key={`${m.at}-${i}`} mine={m.role === 'you'} text={m.text} />
            ))}
            {busy ? (
              live ? (
                <Bubble mine={false} text={live} />
              ) : (
                <View style={[styles.bubble, styles.hers, styles.typing]}>
                  <TypingIndicator color={ROSE} />
                </View>
              )
            ) : null}
            {sendError ? <Meta style={styles.error}>{sendError}</Meta> : null}
          </ScrollView>
        )}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={name ? `Message ${name}…` : 'Message…'}
            placeholderTextColor={Palette.faint}
            style={styles.input}
            multiline
            editable={lane === 'local' && name !== null}
            accessibilityLabel="Message"
          />
          <PressableScale
            onPress={() => void send()}
            disabled={!draft.trim() || busy}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={[styles.send, { opacity: draft.trim() && !busy ? 1 : 0.4 }]}>
            <ArrowUp size={18} color={Palette.ground} />
          </PressableScale>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Bubble({ mine, text }: { mine: boolean; text: string }) {
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.hers]}>
      <Text selectable style={mine ? styles.mineText : styles.hersText}>
        {text}
      </Text>
    </View>
  );
}

function Centered({ text }: { text: string }) {
  return (
    <View style={styles.centered}>
      <Meta style={styles.centeredText}>{text}</Meta>
    </View>
  );
}

/** Her colour. Only this screen uses it: it is her room, not an Igris state. */
const ROSE = '#FB7185';
const ROSE_SOFT = 'rgba(251, 113, 133, 0.14)';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Gutter,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ROSE_SOFT,
  },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 20, lineHeight: 24 },
  list: { paddingHorizontal: Gutter - 6, paddingVertical: Space.lg, gap: Space.sm },
  hello: { textAlign: 'center', marginTop: Space.huge, marginHorizontal: Space.xl },
  bubble: { maxWidth: '82%', paddingHorizontal: Space.md + 2, paddingVertical: Space.sm + 1, borderRadius: 18 },
  mine: { alignSelf: 'flex-end', backgroundColor: Palette.surfaceLift, borderBottomRightRadius: 6 },
  hers: { alignSelf: 'flex-start', backgroundColor: ROSE_SOFT, borderBottomLeftRadius: 6 },
  typing: { paddingVertical: Space.md },
  mineText: { fontFamily: Font.ui, color: Palette.text, ...Type.ask },
  hersText: { fontFamily: Font.ui, color: Palette.text, ...Type.ask },
  error: { color: Palette.alert, textAlign: 'center', marginTop: Space.sm },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Space.xl },
  centeredText: { textAlign: 'center', ...Type.small },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.sm,
    paddingHorizontal: Gutter - 6,
    paddingVertical: Space.sm,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm + 2,
    borderRadius: 21,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
    color: Palette.text,
    fontFamily: Font.ui,
    ...Type.ask,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ROSE,
  },
});

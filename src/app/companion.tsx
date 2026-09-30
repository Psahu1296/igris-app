import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowUp, Camera, ChevronLeft, Heart, Trash2, UserRound } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, StyleSheet, Text, TextInput, ToastAndroid, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DrawnPicture } from '@/components/cards/drawn-picture';
import { PressableScale } from '@/components/pressable-scale';
import { TypingIndicator } from '@/components/typing-indicator';
import { Meta, Title } from '@/components/typography';
import { Font, Gutter, Palette, Space, Type } from '@/constants/theme';
import {
  CompanionRefused,
  fetchCompanion,
  forgetCompanion,
  PHOTO_ASPECT,
  setFace,
  shown,
  streamCompanion,
  withoutTag,
  type CompanionMessage,
  type CompanionPhoto,
} from '@/lib/companion';
import { drawingShare } from '@/lib/drawing-steps';
import { drawnSource, type Lane } from '@/lib/maestro';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import { useSession } from '@/state/session';

/**
 * The owner's private companion chat (lib/companion.ts). A messaging app, not an Igris
 * transcript: bubbles, her words appearing as she types, one endless conversation. Mac
 * only, because her model is local. Her photos arrive after her words (maestro draws them
 * from her base face, ~75 s); any of them can be made the new base face.
 *
 * A turn belongs to the Mac, not to this screen: she answers, and her photo is taken,
 * whether or not the phone is listening. The stream is only the live view of it. When it
 * is lost (the screen went off, the app went to the background) the screen reads the turn
 * back from the Mac and polls until it is done, so the reply is there on coming back.
 */
const POLL_MS = 2500;
/** How long to keep asking a Mac that stopped answering before saying so (~4 minutes). */
const POLL_TRIES = 40;

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
  const [face, setFaceName] = useState<string | null>(null);
  // A photo being taken after her words: null = none, else mflux's steps so far (0 of 0 = loading).
  const [snapping, setSnapping] = useState<{ done: number; total: number } | null>(null);
  const lastSend = useRef(0);
  const scroller = useRef<ScrollView>(null);
  const bottomInset = useKeyboardInset();
  const mounted = useRef(true);
  // The live stream of a turn, while there is one; aborted when the app comes back, since
  // a socket that slept with the screen may never say it died.
  const stream = useRef<AbortController | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);
  type SyncOpts = { lost?: string; tries?: number; first?: boolean };
  // sync() asks again by timer; through a ref, since a callback cannot name itself.
  const syncLater = useRef<(opts: SyncOpts) => void>(() => {});

  /**
   * Show what the Mac has: the saved chat and the turn in flight, asking again until the
   * turn is done. `lost`: a message whose stream died, to put back in the box if it turns
   * out never to have reached the Mac. `tries`: failed asks so far, while a turn is awaited.
   */
  const sync = useCallback(
    async (opts: SyncOpts = {}) => {
      if (poll.current) clearTimeout(poll.current);
      poll.current = null;
      const again = (next: SyncOpts) => {
        poll.current = setTimeout(() => syncLater.current(next), POLL_MS);
      };
      try {
        const c = await fetchCompanion(lane);
        if (!mounted.current || stream.current) return; // a newer turn is streaming live
        const view = shown(c);
        setName(c.name);
        setModel(c.model);
        setFaceName(c.face);
        setMessages(view.messages);
        setLive(view.live);
        setSnapping(view.snapping);
        if (c.pending) {
          setSendError(null);
          again({});
        } else if (opts.lost !== undefined) {
          const lost = opts.lost;
          if (c.messages.slice(-2).some((m) => m.role === 'you' && m.text === lost)) setSendError(null);
          else {
            setDraft((d) => d || lost);
            setSendError('That message did not reach the Mac. Send it again.');
          }
        }
      } catch (e) {
        if (!mounted.current || stream.current) return;
        const message = e instanceof Error ? e.message : String(e);
        if (opts.first) setLoadError(message);
        else if (opts.lost === undefined && opts.tries === undefined) return; // a quiet refresh; nothing awaited
        else if ((opts.tries ?? 0) < POLL_TRIES) again({ lost: opts.lost, tries: (opts.tries ?? 0) + 1 });
        else {
          setLive(null);
          setSnapping(null);
          setSendError(`Lost the Mac: ${message}`);
        }
      }
    },
    [lane]
  );

  useEffect(() => {
    syncLater.current = (opts) => void sync(opts);
  }, [sync]);

  useEffect(() => {
    if (lane !== 'local') return;
    mounted.current = true;
    syncLater.current({ first: true }); // set by the effect above, which runs first
    // Back from the background or a dark screen: whatever was streaming is stale.
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (stream.current) stream.current.abort(); // send()'s catch picks the turn up
      else syncLater.current({ tries: 0 });
    });
    return () => {
      mounted.current = false;
      sub.remove();
      if (poll.current) clearTimeout(poll.current);
      stream.current?.abort();
    };
  }, [lane]);

  /**
   * One turn. `snap`: the camera button, a photo of the moment with no message from him
   * (the draft is left alone); otherwise the draft is sent.
   */
  const send = useCallback(async (snap = false) => {
    const text = snap ? undefined : draft.trim();
    // The same double-submit guard as the composer: one Enter can fire submit twice.
    const now = Date.now();
    if (text === '' || live !== null || snapping || now - lastSend.current < 800) return;
    lastSend.current = now;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSendError(null);
    const at = new Date().toISOString();
    if (text !== undefined) {
      setDraft('');
      setMessages((m) => [...m, { role: 'you', text, at }]);
    }
    setLive('');
    let words = '';
    const herAt = new Date(Date.now() + 1).toISOString();
    // Her photo joins her words' bubble, or stands alone when she sent only a photo.
    const attach = (image: CompanionPhoto) =>
      setMessages((m) =>
        m.some((msg) => msg.at === herAt)
          ? m.map((msg) => (msg.at === herAt ? { ...msg, image } : msg))
          : [...m, { role: 'her', text: '', at: herAt, image }]
      );
    const controller = new AbortController();
    stream.current = controller;
    // The stream was lost, not the turn: the Mac carries on, and sync() shows it.
    let handedOver = false;
    try {
      await streamCompanion({
        lane,
        message: text,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.kind === 'token') {
            words += event.text;
            setLive(words);
          } else if (event.kind === 'reply') {
            if (event.text) setMessages((m) => [...m, { role: 'her', text: event.text, at: herAt }]);
            setLive(null);
          } else if (event.kind === 'photoStarted') {
            setSnapping({ done: 0, total: 0 });
          } else if (event.kind === 'progress') {
            setSnapping({ done: event.done, total: event.total });
          } else if (event.kind === 'photo') {
            attach(event.photo);
            // The first photo ever also made her base face on the Mac.
            setFaceName((f) => f ?? event.photo.name);
          } else if (event.kind === 'photoFailed') {
            setSendError(`No photo this time: ${event.message}`);
          }
        },
      });
    } catch (e) {
      if (e instanceof CompanionRefused) {
        setSendError(e.message);
        if (text !== undefined) {
          // Not saved on the Mac either: put the words back so they can be sent again.
          setMessages((m) => m.filter((msg) => msg.at !== at));
          setDraft(text);
        }
      } else {
        handedOver = true;
      }
    } finally {
      if (stream.current === controller) stream.current = null;
      if (handedOver) {
        if (mounted.current) void sync({ lost: text, tries: 0 });
      } else {
        setLive(null);
        setSnapping(null);
      }
    }
  }, [draft, live, snapping, lane, sync]);

  const makeFace = (photo: CompanionPhoto) =>
    Alert.alert(`Make this ${name}'s face?`, 'Every photo she sends from now on is drawn from this one.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Use this face',
        onPress: () =>
          void setFace(lane, photo.name)
            .then(() => {
              setFaceName(photo.name);
              ToastAndroid.show('New photos will use this face.', ToastAndroid.SHORT);
            })
            .catch((e: unknown) => setSendError(e instanceof Error ? e.message : String(e))),
      },
    ]);

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

  const busy = live !== null || snapping !== null;

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
          <Avatar lane={lane} face={face} />
          <View style={styles.headerText}>
            <Title style={styles.name}>{name ?? ' '}</Title>
            <Meta numberOfLines={1}>
              {snapping ? 'sending a photo…' : busy ? 'typing…' : model ? `on ${model}` : ' '}
            </Meta>
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
              <Bubble
                key={`${m.at}-${i}`}
                lane={lane}
                mine={m.role === 'you'}
                text={m.text}
                image={m.image}
                isFace={!!m.image && m.image.name === face}
                onMakeFace={makeFace}
              />
            ))}
            {snapping ? (
              <View style={[styles.bubble, styles.hers, styles.snapping]}>
                <View style={styles.snapRow}>
                  <Camera size={14} color={ROSE} />
                  <Meta style={styles.snapText}>
                    {snapping.total ? `Taking a photo · ${snapping.done} of ${snapping.total}` : 'Getting ready for a photo…'}
                  </Meta>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fillBar, { width: `${drawingShare(snapping) * 100}%` }]} />
                </View>
              </View>
            ) : live !== null ? (
              withoutTag(live) ? (
                <Bubble lane={lane} mine={false} text={withoutTag(live)} />
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
          <PressableScale
            onPress={() => void send(true)}
            disabled={busy || name === null || lane !== 'local'}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Ask ${name ?? 'her'} for a photo of this moment`}
            style={[styles.snap, { opacity: busy || name === null ? 0.4 : 1 }]}>
            <Camera size={18} color={ROSE} />
          </PressableScale>
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

function Bubble({
  lane,
  mine,
  text,
  image,
  isFace = false,
  onMakeFace,
}: {
  lane: Lane;
  mine: boolean;
  text: string;
  image?: CompanionPhoto;
  isFace?: boolean;
  onMakeFace?: (photo: CompanionPhoto) => void;
}) {
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.hers, image ? styles.withPhoto : null]}>
      {image ? (
        <View style={styles.photo}>
          <DrawnPicture lane={lane} picture={{ name: image.name, prompt: image.scene }} aspect={PHOTO_ASPECT} />
          {isFace ? (
            <View style={styles.faceBadge}>
              <UserRound size={11} color={Palette.text} />
              <Meta style={styles.faceBadgeText}>Base face</Meta>
            </View>
          ) : onMakeFace ? (
            <PressableScale
              onPress={() => onMakeFace(image)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Make this her base face"
              style={styles.faceBadge}>
              <UserRound size={11} color={Palette.text} />
              <Meta style={styles.faceBadgeText}>Use as face</Meta>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
      {text ? (
        <Text selectable style={mine ? styles.mineText : styles.hersText}>
          {text}
        </Text>
      ) : null}
    </View>
  );
}

/** Her base face in the header, once there is one; a heart before her first photo. */
function Avatar({ lane, face }: { lane: Lane; face: string | null }) {
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  useEffect(() => {
    if (!face) return;
    let live = true;
    drawnSource(lane, face)
      .then((s) => live && setSource(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [lane, face]);
  return (
    <View style={styles.avatar}>
      {face && source ? (
        <Image source={source} style={styles.avatarImage} contentFit="cover" />
      ) : (
        <Heart size={16} color={ROSE} fill={ROSE} />
      )}
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
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 20, lineHeight: 24 },
  list: { paddingHorizontal: Gutter - 6, paddingVertical: Space.lg, gap: Space.sm },
  hello: { textAlign: 'center', marginTop: Space.huge, marginHorizontal: Space.xl },
  bubble: { maxWidth: '82%', paddingHorizontal: Space.md + 2, paddingVertical: Space.sm + 1, borderRadius: 18 },
  mine: { alignSelf: 'flex-end', backgroundColor: Palette.surfaceLift, borderBottomRightRadius: 6 },
  hers: { alignSelf: 'flex-start', backgroundColor: ROSE_SOFT, borderBottomLeftRadius: 6 },
  typing: { paddingVertical: Space.md },
  withPhoto: { width: '78%', paddingHorizontal: Space.xs, paddingTop: Space.xs, gap: Space.sm },
  photo: { borderRadius: 14, overflow: 'hidden' },
  faceBadge: {
    position: 'absolute',
    left: Space.sm,
    top: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(9, 8, 14, 0.7)',
  },
  faceBadgeText: { color: Palette.text },
  snapping: { width: '78%', gap: Space.sm, paddingVertical: Space.md },
  snapRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs + 2 },
  snapText: { color: Palette.muted, ...Type.small },
  track: { height: 4, borderRadius: 2, backgroundColor: Palette.hairline, overflow: 'hidden' },
  fillBar: { height: '100%', borderRadius: 2, backgroundColor: ROSE },
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
  // The camera button: outlined, so it reads as the quieter of the two round buttons.
  snap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.hairline,
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

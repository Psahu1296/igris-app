import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ArrowUp, Camera, ChevronDown, ChevronLeft, Clapperboard, Clock, Eye, Heart, Mic, Radio, SlidersHorizontal, Smile, Square, Trash2, UserRound, Volume2, VolumeX, Wrench } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, ToastAndroid, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DrawnPicture } from '@/components/cards/drawn-picture';
import { DiarySheet } from '@/components/companion/diary-sheet';
import { DirectorSheet, FixSheet } from '@/components/companion/director-sheet';
import { MemorySheet } from '@/components/companion/memory-sheet';
import { OncePhoto } from '@/components/companion/once-photo';
import { CompanionTray } from '@/components/companion/tray';
import { PhotoViewer } from '@/components/photo-viewer';
import { PressableScale } from '@/components/pressable-scale';
import { TypingIndicator } from '@/components/typing-indicator';
import { Meta, Title } from '@/components/typography';
import { Font, Gutter, Palette, Space, Type } from '@/constants/theme';
import {
  bubbles,
  companionWho,
  CompanionRefused,
  emotes,
  fetchCompanion,
  forgetCompanion,
  lastCompanion,
  deleteMessage,
  directorMode,
  likeMessage,
  liveMode,
  markSeen,
  moodLine,
  setDial,
  PHOTO_ASPECT,
  setFace,
  shown,
  sounds,
  streamCompanion,
  withEmote,
  withoutTag,
  type CompanionDial,
  type CompanionListing,
  type CompanionPhotosComing,
  comingLine,
  type CompanionMessage,
  type CompanionOutfit,
  type CompanionPhoto,
  type PhotoView,
  type CompanionScene,
} from '@/lib/companion';
import { canSpeak, hush, releaseSeemaVoice, say, voiceMode } from '@/lib/companion-voice';
import { drawingShare } from '@/lib/drawing-steps';
import { drawnSource, type Lane, type Photo } from '@/lib/maestro';
import { pickPhoto } from '@/lib/photo';
import { useListening } from '@/lib/voice/use-listening';
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
 *
 * Since 2026-09-30 she has a state of her own on the Mac (mood, where she is: the header
 * shows it), a memory (the tray's Memory chip), and more ways to start a turn: a scene or
 * a game, a photo of his, the mic. A heart on her message tells her what he liked.
 */
/** What starts a turn besides the typed draft: the camera button, a scene card, a photo of his. */
type Turn = { snap?: boolean; scene?: string; outfit?: string; photo?: Photo; view?: PhotoView };
/** How often an idle screen asks the Mac what is new: she may answer late, or write first. */
const IDLE_MS = 20_000;

const POLL_MS = 2500;
/** How long to keep asking a Mac that stopped answering before saying so (~4 minutes). */
const POLL_TRIES = 40;

/**
 * Which companion is open (maestro companion/profiles.py). A switch remounts the chat by
 * its key, so nothing of one (her messages, a turn being polled, her mood) shows in the other.
 */
export default function CompanionScreen() {
  const [who, setWho] = useState(companionWho.get);
  const pick = useCallback((next: string) => {
    companionWho.set(next);
    setWho(next);
  }, []);
  return <CompanionChat key={who} onSwitch={pick} />;
}

function CompanionChat({ onSwitch }: { onSwitch: (who: string) => void }) {
  const { lane } = useSession();
  // Opens on what the Mac said last time (lib/companion lastCompanion), then refreshes.
  const [seen] = useState(() => (lane === 'local' ? lastCompanion(lane) : null));
  const [view] = useState(() => (seen ? shown(seen) : null));
  const [name, setName] = useState<string | null>(seen?.name ?? null);
  const [model, setModel] = useState(seen?.model ?? '');
  const [messages, setMessages] = useState<CompanionMessage[]>(view?.messages ?? []);
  // Live mode: a photo with every reply. Kept for the app's run, off at every start.
  const [liveOn, setLiveOn] = useState(liveMode.get);
  // Director mode: the camera button opens the photo director; her photos get Change and Fix.
  const [directing, setDirecting] = useState(directorMode.get);
  // Her voice: every reply said aloud when on; `speaking` is the message being said now.
  const [aloud, setAloud] = useState(voiceMode.get);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const speak = useCallback((at: string, text: string) => {
    setSpeaking(at);
    say(text)
      .catch((e: unknown) => ToastAndroid.show(e instanceof Error ? e.message : 'Her voice did not start.', ToastAndroid.SHORT))
      .finally(() => setSpeaking((now) => (now === at ? null : now)));
  }, []);
  const quiet = useCallback(() => {
    hush();
    setSpeaking(null);
  }, []);
  useEffect(
    () => () => {
      hush();
      void releaseSeemaVoice();
    },
    []
  );
  // The row of his own actions (*hugs you*) above the message box, opened by the smile button.
  const [emoting, setEmoting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // Her reply in flight: null = idle, '' = typing, text = words so far.
  const [live, setLive] = useState<string | null>(view?.live ?? null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [face, setFaceName] = useState<string | null>(seen?.face ?? null);
  // Her mood and where she is, for the header; null before she has said (or on an older maestro).
  const [mood, setMood] = useState<string | null>(seen ? moodLine(seen) : null);
  const [liked, setLiked] = useState<string[]>(seen?.liked ?? []);
  const [scenes, setScenes] = useState<CompanionScene[]>(seen?.scenes ?? []);
  const [outfits, setOutfits] = useState<CompanionOutfit[]>(seen?.outfits ?? []);
  const [dial, setDialState] = useState<CompanionDial | null>(seen?.dial ?? null);
  // The open-once photos he has opened; the Mac keeps the list.
  const [opened, setOpened] = useState<string[]>(seen?.seen ?? []);
  const [others, setOthers] = useState<CompanionListing[]>(
    (seen?.companions ?? []).filter((c) => c.id !== seen?.id)
  );
  const [sheet, setSheet] = useState<'memory' | 'diary' | null>(null);
  // The director (`like`: starting from one photo of hers) or the fix sheet for one photo.
  const [directed, setDirected] = useState<{ like: CompanionPhoto | null } | null>(null);
  const [fixing, setFixing] = useState<CompanionPhoto | null>(null);
  // The mic: what he says lands in the message box, to be read before it is sent.
  const listening = useListening(lane, true);
  // A photo being taken after her words: null = none, else mflux's steps so far (0 of 0 = loading).
  const [snapping, setSnapping] = useState<{ done: number; total: number } | null>(view?.snapping ?? null);
  // Photos made in the background while the chat goes on (never blocks sending).
  const [coming, setComing] = useState<CompanionPhotosComing | null>(null);
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
        setMood(moodLine(c));
        setLiked(c.liked ?? []);
        setScenes(c.scenes ?? []);
        setOutfits(c.outfits ?? []);
        setDialState(c.dial ?? null);
        setOpened(c.seen ?? []);
        setOthers((c.companions ?? []).filter((o) => o.id !== c.id));
        setMessages(view.messages);
        setLive(view.live);
        setSnapping(view.snapping);
        setComing(c.photos ?? null);
        if (c.pending) {
          setSendError(null);
          again({});
        } else if (c.photos) {
          again({}); // look again soon: each photo lands on its own
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
    // She can speak without being asked (back from a meeting, a second text, a message
    // after a long silence): an idle screen looks every so often. Never during a turn.
    const idle = setInterval(() => {
      if (!stream.current && !poll.current && AppState.currentState === 'active') syncLater.current({});
    }, IDLE_MS);
    return () => {
      mounted.current = false;
      clearInterval(idle);
      sub.remove();
      if (poll.current) clearTimeout(poll.current);
      stream.current?.abort();
    };
  }, [lane]);

  /**
   * One turn. `snap`: the camera button, a photo of the moment with no message from him;
   * `scene`: a scene card or a game, which she opens; `outfit`: what he picked for her to
   * wear (the draft is left alone for all three).
   * Otherwise the draft is sent, with `photo` when he picked one (the draft may be empty then).
   */
  const send = useCallback(async (turn: Turn = {}) => {
    const text =
      turn.snap || turn.view || turn.scene !== undefined || turn.outfit !== undefined ? undefined : draft.trim();
    // The same double-submit guard as the composer: one Enter can fire submit twice.
    const now = Date.now();
    if ((text === '' && !turn.photo) || live !== null || snapping || now - lastSend.current < 800) return;
    lastSend.current = now;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    quiet();
    setSendError(null);
    const at = new Date().toISOString();
    if (text !== undefined) {
      setDraft('');
      const image = turn.photo ? { name: '', model: '', scene: '', his: true, uri: turn.photo.uri } : undefined;
      setMessages((m) => [...m, { role: 'you', text, at, image }]);
    }
    setLive('');
    let words = '';
    let felt = 0;
    // A retake throws the draft away for a fresh one (repeat.py, express.py on the Mac):
    // showing it fully formed and then swapping it for something unrelated read as a
    // second, different reply. Once it fires, stay on the typing dots — silently, since
    // the kept message always arrives whole in the `reply` event below, not built from
    // `words` — until she actually has something she is keeping.
    let retaking = false;
    const herAt = new Date(Date.now() + 1).toISOString();
    // Her photo joins her words' bubble, or stands alone when she sent only a photo, or
    // when it is a later photo of a set.
    const attach = (image: CompanionPhoto) =>
      setMessages((m) =>
        m.some((msg) => msg.at === herAt && !msg.image)
          ? m.map((msg) => (msg.at === herAt ? { ...msg, image } : msg))
          : [...m, { role: 'her', text: '', at: `${herAt}+${image.name}`, image }]
      );
    const controller = new AbortController();
    stream.current = controller;
    // The stream was lost, not the turn: the Mac carries on, and sync() shows it.
    let handedOver = false;
    try {
      await streamCompanion({
        lane,
        message: text,
        image: turn.photo?.base64,
        scene: turn.scene,
        outfit: turn.outfit,
        view: turn.view,
        live: liveOn,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.kind === 'token') {
            if (retaking) return; // a thrown-away draft is never shown, only the one she keeps
            words += event.text;
            setLive(words);
            // Each new sound of hers (ahh, mmm) is felt as it arrives.
            const made = sounds(words).length;
            if (made > felt) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            felt = made;
          } else if (event.kind === 'retake') {
            retaking = true;
            words = '';
            felt = 0;
            setLive('');
          } else if (event.kind === 'away') {
            // Saved on the Mac, not answered yet: the header says why, and the idle look finds her reply.
            setLive(null);
            setMood(moodLine({ away: event.away }));
          } else if (event.kind === 'reply') {
            if (event.text) setMessages((m) => [...m, { role: 'her', text: event.text, at: herAt, took: event.seconds }]);
            if (event.text && voiceMode.get()) speak(herAt, event.text);
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
        // Read the turn back as the Mac saved it: her mood, and the ids a heart needs.
        if (mounted.current) void sync();
      }
    }
  }, [draft, live, snapping, lane, sync, liveOn, speak, quiet]);

  const sendPhoto = async (source: 'camera' | 'library') => {
    try {
      const photo = await pickPhoto(source);
      if (photo) void send({ photo });
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
    }
  };

  /** A heart on her message, shown at once and taken back if the Mac refuses. */
  const toggleLike = (at: string) => {
    const on = !liked.includes(at);
    const before = liked;
    setLiked(on ? [...liked, at] : liked.filter((a) => a !== at));
    void Haptics.selectionAsync();
    likeMessage(lane, at, on)
      .then(setLiked)
      .catch((e: unknown) => {
        setLiked(before);
        ToastAndroid.show(e instanceof Error ? e.message : String(e), ToastAndroid.SHORT);
      });
  };

  /** Deletes one message, his or hers, after he confirms; gone at once, put back if the
   * Mac refuses. A photo's underlying file is not removed, only the message that showed it. */
  const deleteMsg = (at: string) => {
    Alert.alert('Delete this message?', 'This only removes it from the chat.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const before = messages;
          setMessages((m) => m.filter((msg) => msg.at !== at));
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          deleteMessage(lane, at).catch((e: unknown) => {
            setMessages(before);
            ToastAndroid.show(e instanceof Error ? e.message : String(e), ToastAndroid.SHORT);
          });
        },
      },
    ]);
  };

  const turnDial = (next: CompanionDial) => {
    const before = dial;
    setDialState(next);
    void Haptics.selectionAsync();
    setDial(lane, next).catch((e: unknown) => {
      setDialState(before);
      ToastAndroid.show(e instanceof Error ? e.message : String(e), ToastAndroid.SHORT);
    });
  };

  /** He opened a photo that opens once. If the Mac never hears, it would open again: say so. */
  const openOnce = (photo: CompanionPhoto) => {
    setOpened((names) => [...names, photo.name]);
    markSeen(lane, photo.name).catch((e: unknown) => ToastAndroid.show(e instanceof Error ? e.message : String(e), ToastAndroid.SHORT));
  };

  const talk = () => {
    if (listening.state !== 'idle') void listening.stop();
    else void listening.start((heard) => setDraft((d) => (d ? `${d} ${heard}` : heard)));
  };

  // The other companions on the Mac, one tap each (Android's alert holds three buttons:
  // two companions to switch to and Cancel; a longer list will want a sheet).
  const switchTo = () => {
    Alert.alert('Talk to', undefined, [
      ...others.slice(0, 2).map((o) => ({ text: o.busy ? `${o.name} (replying…)` : o.name, onPress: () => onSwitch(o.id) })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  const toggleLive = () => {
    const on = !liveOn;
    liveMode.set(on);
    setLiveOn(on);
    void Haptics.selectionAsync();
    ToastAndroid.show(
      on ? `Live: ${name ?? 'she'} sends a photo with every reply. Replies take longer.` : 'Live is off.',
      ToastAndroid.SHORT
    );
  };

  const toggleDirector = () => {
    const on = !directing;
    directorMode.set(on);
    setDirecting(on);
    void Haptics.selectionAsync();
    ToastAndroid.show(
      on ? 'Director: the camera button lets you pick the photo. Her photos get Change and Fix.' : 'Director is off.',
      ToastAndroid.SHORT
    );
  };

  /** A directed photo or a retake was queued on the Mac: show it coming. */
  const queued = (message: string) => {
    setDirected(null);
    setFixing(null);
    ToastAndroid.show(message, ToastAndroid.SHORT);
    void sync({});
  };

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
          <Pressable
            style={styles.headerText}
            disabled={others.length === 0}
            onPress={switchTo}
            accessibilityRole="button"
            accessibilityLabel={others.length ? `Talking to ${name ?? 'her'}. Switch companion` : undefined}>
            <View style={styles.nameRow}>
              <Title style={styles.name}>{name ?? ' '}</Title>
              {others.length ? <ChevronDown size={16} color={Palette.muted} /> : null}
            </View>
            <Meta numberOfLines={1}>
              {snapping ? 'sending a photo…' : busy ? 'typing…' : (mood ?? (model ? `on ${model}` : ' '))}
            </Meta>
          </Pressable>
          {name !== null && lane === 'local' ? (
            <PressableScale
              onPress={toggleLive}
              hitSlop={8}
              accessibilityRole="switch"
              accessibilityState={{ checked: liveOn }}
              accessibilityLabel="Live: a photo with every reply"
              style={[styles.liveChip, liveOn ? styles.liveChipOn : null]}>
              <Radio size={13} color={liveOn ? Palette.ground : Palette.muted} />
              <Text style={[styles.liveChipText, liveOn ? styles.liveChipTextOn : null]}>Live</Text>
            </PressableScale>
          ) : null}
          {name !== null && lane === 'local' ? (
            <PressableScale
              onPress={toggleDirector}
              hitSlop={8}
              accessibilityRole="switch"
              accessibilityState={{ checked: directing }}
              accessibilityLabel="Director: pick each part of her photos"
              style={[styles.liveChip, directing ? styles.liveChipOn : null]}>
              <Clapperboard size={13} color={directing ? Palette.ground : Palette.muted} />
            </PressableScale>
          ) : null}
          {name !== null && lane === 'local' && canSpeak() ? (
            <PressableScale
              onPress={() => {
                void Haptics.selectionAsync();
                voiceMode.set(!aloud);
                setAloud(!aloud);
                if (aloud) quiet();
              }}
              hitSlop={10}
              accessibilityRole="switch"
              accessibilityState={{ checked: aloud }}
              accessibilityLabel="Say her replies aloud"
              style={styles.iconButton}>
              {aloud ? <Volume2 size={16} color={ROSE} /> : <VolumeX size={16} color={Palette.muted} />}
            </PressableScale>
          ) : null}
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
            {messages.flatMap((m, i) => {
              // Her separate thoughts are separate texts; a photo keeps its words under it.
              // Saved text is already clean (maestro strips her hidden line before saving);
              // withoutTag here is a second net, not the fix — see its own comment.
              // A message with her photo is cleaned too: a tag the Mac failed to read (one of
              // 913 characters, 2026-10-02) was saved in her words and shown under the photo.
              const parts = m.role !== 'her' ? [m.text] : m.image ? [withoutTag(m.text).trim()] : bubbles(withoutTag(m.text));
              return parts.map((part, j) => (
                <Bubble
                  key={`${m.at}-${i}-${j}`}
                  lane={lane}
                  mine={m.role === 'you'}
                  text={part}
                  image={m.image}
                  isFace={!!m.image && m.image.name === face}
                  onMakeFace={makeFace}
                  onView={(photo, view) => void send({ view: { name: photo.name, view } })}
                  onChange={directing ? (photo) => setDirected({ like: photo }) : undefined}
                  onFix={directing ? setFixing : undefined}
                  opened={!!m.image && opened.includes(m.image.name)}
                  onOpenOnce={openOnce}
                  liked={liked.includes(m.at)}
                  onLike={m.role === 'her' && j === parts.length - 1 ? () => toggleLike(m.at) : undefined}
                  seconds={m.role === 'her' && j === parts.length - 1 ? m.took : undefined}
                  speaking={speaking === m.at}
                  onSpeak={
                    m.role === 'her' && m.text && j === parts.length - 1 && canSpeak()
                      ? () => (speaking === m.at ? quiet() : speak(m.at, m.text))
                      : undefined
                  }
                  onDelete={() => deleteMsg(m.at)}
                />
              ));
            })}
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
            ) : null}
            {coming && !snapping ? (
              <View style={[styles.bubble, styles.hers, styles.snapping]}>
                <View style={styles.snapRow}>
                  <Camera size={14} color={ROSE} />
                  <Meta style={styles.snapText}>{comingLine(coming)}</Meta>
                </View>
                {coming.drawing ? (
                  <View style={styles.track}>
                    <View style={[styles.fillBar, { width: `${drawingShare(coming.drawing) * 100}%` }]} />
                  </View>
                ) : null}
              </View>
            ) : null}
            {snapping ? null : live !== null ? (
              withoutTag(live) ? (
                bubbles(withoutTag(live)).map((part, j) => <Bubble key={j} lane={lane} mine={false} text={part} />)
              ) : (
                <View style={[styles.bubble, styles.hers, styles.typing]}>
                  <TypingIndicator color={ROSE} />
                </View>
              )
            ) : null}
            {sendError ? <Meta style={styles.error}>{sendError}</Meta> : null}
          </ScrollView>
        )}

        {emoting ? (
          <CompanionTray
            scenes={scenes}
            outfits={outfits}
            dial={dial}
            busy={busy}
            accent={ROSE}
            onEmote={(emote) => setDraft((d) => withEmote(d, emote))}
            onScene={(scene) => void send({ scene: scene.id })}
            onOutfit={(outfit) => void send({ outfit: outfit.id })}
            onDial={turnDial}
            onPhoto={(source) => void sendPhoto(source)}
            onMemory={() => setSheet('memory')}
            onDiary={() => setSheet('diary')}
          />
        ) : null}
        {sheet === 'memory' && name ? <MemorySheet lane={lane} name={name} accent={ROSE} onClose={() => setSheet(null)} /> : null}
        {sheet === 'diary' && name ? <DiarySheet lane={lane} name={name} accent={ROSE} onClose={() => setSheet(null)} /> : null}
        {directed ? (
          <DirectorSheet
            lane={lane}
            accent={ROSE}
            like={directed.like}
            onClose={() => setDirected(null)}
            onSent={() => queued(`${name ?? 'She'} is taking it…`)}
          />
        ) : null}
        {fixing ? (
          <FixSheet
            lane={lane}
            accent={ROSE}
            photo={fixing}
            onClose={() => setFixing(null)}
            onSent={(retook) => (retook ? queued('Retaking it with the fixes…') : queued('Noted for the next photos.'))}
          />
        ) : null}
        <View style={styles.composer}>
          <PressableScale
            onPress={() => (directing ? setDirected({ like: null }) : void send({ snap: true }))}
            disabled={(busy && !directing) || name === null || lane !== 'local'}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={directing ? 'Direct a photo' : `Ask ${name ?? 'her'} for a photo of this moment`}
            style={[styles.snap, directing ? styles.snapOn : null, { opacity: (busy && !directing) || name === null ? 0.4 : 1 }]}>
            {directing ? <SlidersHorizontal size={18} color={ROSE} /> : <Camera size={18} color={ROSE} />}
          </PressableScale>
          <PressableScale
            onPress={() => setEmoting((on) => !on)}
            disabled={name === null || lane !== 'local'}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ expanded: emoting }}
            accessibilityLabel="Actions, scenes, photos and her memory"
            style={[styles.snap, emoting ? styles.snapOn : null, { opacity: name === null ? 0.4 : 1 }]}>
            <Smile size={18} color={ROSE} />
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
          {draft.trim() || !listening.available ? (
            <PressableScale
              onPress={() => void send()}
              disabled={!draft.trim() || busy}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={[styles.send, { opacity: draft.trim() && !busy ? 1 : 0.4 }]}>
              <ArrowUp size={18} color={Palette.ground} />
            </PressableScale>
          ) : (
            // Nothing typed: the same button listens, and what he says lands in the box.
            <PressableScale
              onPress={talk}
              disabled={name === null || listening.state === 'transcribing'}
              accessibilityRole="button"
              accessibilityLabel={listening.state === 'listening' ? 'Stop listening' : 'Speak your message'}
              style={[styles.send, { opacity: name === null || listening.state === 'transcribing' ? 0.4 : 1 }]}>
              {listening.state === 'idle' ? <Mic size={18} color={Palette.ground} /> : <Square size={15} color={Palette.ground} />}
            </PressableScale>
          )}
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
  onView,
  onChange,
  onFix,
  opened = false,
  onOpenOnce,
  liked = false,
  onLike,
  speaking = false,
  onSpeak,
  seconds,
  onDelete,
}: {
  lane: Lane;
  mine: boolean;
  text: string;
  image?: CompanionPhoto;
  isFace?: boolean;
  onMakeFace?: (photo: CompanionPhoto) => void;
  /** Her photo again, from his eyes or hers (a new photo, about two and a half minutes). */
  onView?: (photo: CompanionPhoto, view: PhotoView['view']) => void;
  /** Director mode: the director, starting from this photo's choices and seed (directed photos only). */
  onChange?: (photo: CompanionPhoto) => void;
  /** Director mode: mark what came out wrong, and retake. */
  onFix?: (photo: CompanionPhoto) => void;
  /** An open-once photo he has already opened. */
  opened?: boolean;
  onOpenOnce?: (photo: CompanionPhoto) => void;
  liked?: boolean;
  /** Her saved messages only: puts a heart on it, or takes it off. */
  onLike?: () => void;
  /** This message is being said aloud right now. */
  speaking?: boolean;
  /** Her messages, on a build with her voice: says it, or stops it. */
  onSpeak?: () => void;
  /** How long her reply took to generate (maestro api/companion.py); the image has its
   * own time in `image.seconds`. Shown above the like/speak icons, her messages only. */
  seconds?: number;
  /** Long-press this message to delete it, his or hers. */
  onDelete?: () => void;
}) {
  const bubble = (
    <Pressable
      onLongPress={onDelete}
      delayLongPress={400}
      style={[styles.bubble, mine ? styles.mine : styles.hers, image ? styles.withPhoto : null]}>
      {image?.uri ? (
        // His own photo, still only on the phone while the turn runs.
        <Image source={{ uri: image.uri }} style={styles.hisPhoto} contentFit="cover" />
      ) : image?.his ? (
        <View style={styles.photo}>
          <DrawnPicture lane={lane} picture={{ name: image.name, prompt: 'A photo you sent' }} />
        </View>
      ) : image?.once && onOpenOnce ? (
        <View style={styles.photo}>
          <OncePhoto lane={lane} photo={image} opened={opened} onOpen={() => onOpenOnce(image)} />
        </View>
      ) : image ? (
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
          {onView ? (
            <View style={styles.viewRow}>
              {(['his', 'hers'] as const).map((v) => (
                <PressableScale
                  key={v}
                  onPress={() => onView(image, v)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={v === 'his' ? 'This moment from your eyes' : 'This moment from her eyes'}
                  style={styles.viewBadge}>
                  <Eye size={11} color={Palette.text} />
                  <Meta style={styles.faceBadgeText}>{v === 'his' ? 'Your view' : 'Her view'}</Meta>
                </PressableScale>
              ))}
              {onChange && image.direction ? (
                <PressableScale
                  onPress={() => onChange(image)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Change one thing in this photo"
                  style={styles.viewBadge}>
                  <SlidersHorizontal size={11} color={Palette.text} />
                  <Meta style={styles.faceBadgeText}>Change</Meta>
                </PressableScale>
              ) : null}
              {onFix ? (
                <PressableScale
                  onPress={() => onFix(image)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Say what is wrong in this photo"
                  style={[styles.viewBadge, image.faults?.length ? styles.faultBadge : null]}>
                  <Wrench size={11} color={Palette.text} />
                  <Meta style={styles.faceBadgeText}>{image.faults?.length ? `Fix · ${image.faults.length}` : 'Fix'}</Meta>
                </PressableScale>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      {text ? (
        <Text selectable style={mine ? styles.mineText : styles.hersText}>
          {emotes(text).map((part, i) =>
                part.action ? (
                  <Text key={i} style={styles.action}>
                    {part.text}
                  </Text>
                ) : part.sound && !mine ? (
                  <Text key={i} style={styles.sound}>
                    {part.text}
                  </Text>
                ) : (
                  part.text
                )
          )}
        </Text>
      ) : null}
    </Pressable>
  );
  if (!onLike) return bubble;
  // The heart sits beside the bubble, in a row of its own: a child drawn outside its
  // parent's bounds gets no touches on Android.
  return (
    <View style={styles.likeRow}>
      {bubble}
      <View>
        {seconds != null || image?.seconds != null ? (
          <View style={styles.timing}>
            {seconds != null ? (
              <View style={styles.timingRow}>
                <Clock size={9} color={Palette.faint} />
                <Meta style={styles.timingText}>{seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s</Meta>
              </View>
            ) : null}
            {image?.seconds != null ? (
              <View style={styles.timingRow}>
                <Camera size={9} color={Palette.faint} />
                <Meta style={styles.timingText}>{Math.round(image.seconds)}s</Meta>
              </View>
            ) : null}
          </View>
        ) : null}
        {onSpeak ? (
          <PressableScale
            onPress={onSpeak}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={speaking ? 'Stop her voice' : 'Hear this message'}
            style={styles.like}>
            {speaking ? <Square size={11} color={ROSE} fill={ROSE} /> : <Volume2 size={14} color={Palette.faint} />}
          </PressableScale>
        ) : null}
      <PressableScale
          onPress={onLike}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityState={{ selected: liked }}
          accessibilityLabel={liked ? 'Take the heart off' : 'Love this message'}
          style={styles.like}>
        <Heart size={14} color={liked ? ROSE : Palette.faint} fill={liked ? ROSE : 'transparent'} />
      </PressableScale>
      </View>
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
  const [open, setOpen] = useState(false);
  if (!face || !source) {
    return (
      <View style={styles.avatar}>
        <Heart size={16} color={ROSE} fill={ROSE} />
      </View>
    );
  }
  return (
    <>
      <PressableScale
        onPress={() => setOpen(true)}
        hitSlop={6}
        accessibilityRole="imagebutton"
        accessibilityLabel="Her photo, full screen"
        style={styles.avatar}>
        <Image source={source} style={styles.avatarImage} contentFit="cover" />
      </PressableScale>
      <PhotoViewer source={open ? source : null} onClose={() => setOpen(false)} />
    </>
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name: { fontSize: 20, lineHeight: 24 },
  list: { paddingHorizontal: Gutter - 6, paddingVertical: Space.lg, gap: Space.sm },
  hello: { textAlign: 'center', marginTop: Space.huge, marginHorizontal: Space.xl },
  bubble: { maxWidth: '82%', paddingHorizontal: Space.md + 2, paddingVertical: Space.sm + 1, borderRadius: 18 },
  mine: { alignSelf: 'flex-end', backgroundColor: Palette.surfaceLift, borderBottomRightRadius: 6 },
  hers: { alignSelf: 'flex-start', backgroundColor: ROSE_SOFT, borderBottomLeftRadius: 6 },
  typing: { paddingVertical: Space.md },
  withPhoto: { width: '78%', paddingHorizontal: Space.xs, paddingTop: Space.xs, gap: Space.sm },
  photo: { borderRadius: 14, overflow: 'hidden' },
  hisPhoto: { width: '100%', aspectRatio: 1, borderRadius: 14 },
  // The heart beside her bubble: faint until tapped.
  likeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  like: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  timing: { alignItems: 'center', gap: 2, marginBottom: 4 },
  timingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  timingText: { color: Palette.faint, fontSize: 9 },
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
  viewRow: {
    position: 'absolute',
    left: Space.sm,
    right: Space.sm,
    bottom: Space.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs + 2,
  },
  faultBadge: { backgroundColor: 'rgba(190, 40, 60, 0.85)' },
  viewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(9, 8, 14, 0.7)',
  },
  snapping: { width: '78%', gap: Space.sm, paddingVertical: Space.md },
  snapRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs + 2 },
  snapText: { color: Palette.muted, ...Type.small },
  track: { height: 4, borderRadius: 2, backgroundColor: Palette.hairline, overflow: 'hidden' },
  fillBar: { height: '100%', borderRadius: 2, backgroundColor: ROSE },
  mineText: { fontFamily: Font.ui, color: Palette.text, ...Type.ask },
  hersText: { fontFamily: Font.ui, color: Palette.text, ...Type.ask },
  // What she does, between her words: a real italic face, a shade quieter than speech.
  action: { fontFamily: Font.voiceItalic, color: Palette.muted },
  // A sound she makes (ahh, mmm, huhh?!): her voice, not her words, so it leans and glows a little.
  sound: { fontFamily: Font.voiceItalic, color: ROSE, letterSpacing: 0.6 },
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
  snapOn: { borderColor: ROSE },
  // The Live switch in the header: a quiet outline when off, filled when on.
  liveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  liveChipOn: { backgroundColor: ROSE, borderColor: ROSE },
  liveChipText: { fontFamily: Font.ui, fontSize: 12, color: Palette.muted },
  liveChipTextOn: { color: Palette.ground },
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

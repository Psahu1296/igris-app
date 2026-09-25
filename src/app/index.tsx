import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import {
  Check,
  CloudSun,
  Copy,
  CreditCard,
  LogOut,
  Menu,
  Plus,
  TrendingUp,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IgrisLoader } from '@/components/igris-loader';
import { Composer } from '@/components/composer';
import { IgrisMark } from '@/components/igris-mark';
import { LaneBadge } from '@/components/lane-badge';
import { LaneMenu } from '@/components/lane-menu';
import { PressableScale } from '@/components/pressable-scale';
import { Sessions } from '@/components/sessions';
import { SideDrawer } from '@/components/side-drawer';
import { Turn, type TurnState } from '@/components/turn';
import { Answer, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space, Type, type Tint } from '@/constants/theme';
import type { Lane } from '@/lib/config';
import {
  callContact,
  findCallee,
  performDeviceAction,
  type Contact,
  type Conversation,
  type DeviceStep,
} from '@/lib/device';
import { COUNTDOWN_MS, matchFavourite, useFavourites, type Favourite } from '@/lib/favourites';
import { AuthError, streamChat } from '@/lib/maestro';
import { readMessages, replyTargets, sendReply, speakable, stopAlarm } from '@/lib/notifications';
import { threadMessages } from '@/lib/threads';
import { onSessionStart, syncTodos, takeSessionStart, type SessionStart } from '@/lib/todos';
import { formatTranscript } from '@/lib/transcript';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import { useListening } from '@/lib/voice/use-listening';
import { useSpeech } from '@/lib/voice/use-speech';
import { useSession } from '@/state/session';

/** Real questions, not feature advertisements — tapping one asks it. */
const OPENERS = [
  { icon: TrendingUp, text: "what's today's revenue" },
  { icon: CreditCard, text: 'who owes money' },
  { icon: CloudSun, text: 'weather in indore' },
];

/** Answers to a pending call or reply card, typed or spoken. Whole-message matches only. */
const YES = /^(yes|yeah|yep|haan|han|ha|ok|okay|sure|go ahead|do it|call|call (him|her|them)|send|send it)[.!]*$/i;
const NO = /^(no|nope|nahi|na|cancel|don'?t|stop)[.!]*$/i;

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const reason = (err: unknown) => (err instanceof Error ? err.message : 'Failed');

export default function Transcript() {
  const {
    lane,
    probing,
    lanePref,
    laneReachable,
    chooseLane,
    refreshLane,
    signOut,
    sessionId,
    sessionIsNew,
    openSession,
    startSession,
  } = useSession();
  const [laneMenuOpen, setLaneMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copiedChat, setCopiedChat] = useState(false);
  const speech = useSpeech();
  const [turns, setTurns] = useState<TurnState[]>([]);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const bottomInset = useKeyboardInset();
  const listening = useListening(lane, laneReachable);
  const [browsing, setBrowsing] = useState(false);

  // Which lane to read history from, without making the lane a reason to reload it.
  // A lane switch mid-conversation used to wipe the transcript and refetch it — and
  // the launch probe flipping 'cloud' → 'local' did exactly that on every start, one
  // 404 from Render and one empty fetch from the Mac for a thread with no history.
  const laneRef = useRef(lane);
  useEffect(() => {
    laneRef.current = lane;
  }, [lane]);

  // 'loading' is shown, not left blank: opening a thread costs ~5s today (a fresh
  // Postgres connection per request to a far-away database — measured, see CLAUDE.md),
  // and a blank screen with quick commands looks exactly like a NEW conversation.
  const [history, setHistory] = useState<'ready' | 'loading' | { error: string }>('ready');

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurns([]);

    // A thread minted on this device has no history by construction. Asking maestro
    // anyway cost a round trip on every launch and returned nothing.
    if (sessionIsNew) {
      setHistory('ready');
      return;
    }

    setHistory('loading');
    const lane = laneRef.current;
    threadMessages(lane, sessionId)
      .then((messages) => {
        if (cancelled) return;
        const restored: TurnState[] = [];
        for (const message of messages) {
          if (message.role === 'user') {
            restored.push({
              id: `${message.created_at}-${restored.length}`,
              ask: message.content,
              answer: null,
              status: null,
              phase: null,
              error: null,
              lane,
              elapsedMs: null,
              device: null,
            });
          } else if (restored.length > 0) {
            restored[restored.length - 1].answer = message.content;
          }
        }
        setTurns(restored);
        setHistory('ready');
      })
      .catch((err) => {
        // Only threads opened from Chats reach here, and those exist — so a failure is
        // real and must be said, not silently rendered as an empty conversation.
        if (!cancelled) {
          setHistory({ error: err instanceof Error ? err.message : 'Could not open it.' });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, sessionIsNew]);

  // Todo alarms are armed from maestro's schedule (lib/todos.ts). Every return to the
  // foreground re-probes the lane (state/session.tsx), which flips `probing`, so this
  // also runs on launch and on every return — no AppState listener of its own.
  useEffect(() => {
    if (probing) return;
    syncTodos(lane).catch((err: unknown) => console.warn('[todos] sync failed', err));
  }, [lane, probing]);

  const patchDevice = useCallback(
    (turnId: string, change: Partial<DeviceStep>) =>
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId && t.device ? { ...t, device: { ...t.device, ...change } } : t))
      ),
    []
  );

  // One pending timer per favourite's countdown. Cleared by Cancel, "no", Call now, or
  // leaving the screen — a countdown must never outlive the card showing it.
  const callTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const clearCallTimer = useCallback((turnId: string) => {
    clearTimeout(callTimers.current.get(turnId));
    callTimers.current.delete(turnId);
  }, []);
  useEffect(() => {
    const timers = callTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // How a call is placed: a tap on the confirm card, a spoken/typed "yes" to a card
  // with a single candidate (see `ask`), a quick-call chip, or a favourite's countdown
  // running out. maestro can propose, never ring.
  const confirmCall = useCallback(
    async (turnId: string, contact: Contact) => {
      clearCallTimer(turnId);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void speech.stop(); // Igris talking over the ringback is not a feature
      patchDevice(turnId, { status: 'running', detail: null, candidates: [contact] });
      try {
        patchDevice(turnId, { status: 'done', detail: await callContact(contact) });
      } catch (err) {
        patchDevice(turnId, { status: 'failed', detail: reason(err) });
      }
    },
    [patchDevice, speech, clearCallTimer]
  );

  // A dictated reply goes out only from here: a tap on the reply card, or "yes" to a
  // card with a single chat. Like a call, maestro can draft it but never send it.
  const confirmReply = useCallback(
    async (turnId: string, target: Conversation, text: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      patchDevice(turnId, { status: 'running', detail: null, conversations: [target] });
      try {
        patchDevice(turnId, { status: 'done', detail: await sendReply(target, text) });
      } catch (err) {
        patchDevice(turnId, { status: 'failed', detail: reason(err) });
      }
    },
    [patchDevice]
  );

  const cancelCall = useCallback(
    (turnId: string) => {
      clearCallTimer(turnId);
      patchDevice(turnId, { status: 'cancelled', detail: 'Cancelled' });
    },
    [patchDevice, clearCallTimer]
  );

  const startCountdown = useCallback(
    (turnId: string, favourite: Favourite) => {
      clearCallTimer(turnId);
      callTimers.current.set(
        turnId,
        setTimeout(() => void confirmCall(turnId, favourite), COUNTDOWN_MS)
      );
    },
    [confirmCall, clearCallTimer]
  );

  // A quick-call chip on the home screen. The tap IS the confirmation, so it rings at
  // once — but still as a turn, so the result (or a refused permission) is on screen.
  const quickCall = useCallback(
    (favourite: Favourite) => {
      const id = `${Date.now()}`;
      setTurns((prev) => [
        ...prev,
        {
          id,
          ask: `Call ${favourite.name}`,
          answer: null,
          status: null,
          phase: null,
          error: null,
          lane,
          elapsedMs: null,
          device: {
            action: { kind: 'call', name: favourite.name, number: null },
            status: 'running',
            detail: null,
            candidates: [favourite],
          },
        },
      ]);
      void confirmCall(id, favourite);
    },
    [lane, confirmCall]
  );

  const ask = useCallback(
    async (message: string, extra?: { todoSession?: { todo_id: string; occurrence_at: string | null } }) => {
      // A reply to a pending call card is answered here, on the phone — sending "yes"
      // to maestro would only get it classified as chit-chat. Only for a single
      // candidate: "yes" to a list of three Rahuls would be a guess.
      const pending = [...turns]
        .reverse()
        .find((t) => t.device?.status === 'confirm' || t.device?.status === 'countdown');
      const step = pending?.device;
      if (pending && step && YES.test(message.trim())) {
        if (step.action.kind === 'notify.reply' && step.conversations?.length === 1) {
          return void confirmReply(pending.id, step.conversations[0], step.action.text);
        }
        if (step.candidates?.length === 1) return void confirmCall(pending.id, step.candidates[0]);
      }
      if (pending && NO.test(message.trim())) return cancelCall(pending.id);

      // Auto on Render may be stale: one probe that caught the Mac mid-restart kept the
      // app on Render for the rest of the session, and Render's maestro lacks the Mac's
      // tools (device actions, dhaba). Ask the Mac again before settling for Render —
      // tens of ms on the tailnet, at most PROBE_TIMEOUT_MS when it really is asleep.
      const turnLane = lanePref === 'auto' && lane === 'cloud' ? await refreshLane() : lane;

      const id = `${Date.now()}`;
      const startedAt = Date.now();

      setTurns((prev) => [
        ...prev,
        {
          id,
          ask: message,
          answer: null,
          status: 'Igris is thinking…',
          phase: 'thinking',
          error: null,
          lane: turnLane,
          elapsedMs: null,
          device: null,
        },
      ]);
      setBusy(true);
      void speech.stop();

      const patch = (change: Partial<TurnState>) =>
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...change } : t)));

      try {
        let answered = false;
        // Set when the phone itself will speak this turn (reading messages aloud),
        // so maestro's "checking your messages" does not talk over it.
        let phoneSpeaks = false;
        await streamChat({
          lane: turnLane,
          message,
          sessionId,
          todoSession: extra?.todoSession,
          onEvent: (event) => {
            if (event.kind === 'answer') {
              answered = true;
              patch({
                answer: event.message,
                status: null,
                phase: null,
                elapsedMs: Date.now() - startedAt,
              });
              if (!phoneSpeaks) void speech.speak(event.message, id);
            } else if (event.kind === 'device') {
              // Perform it now, not after the answer: the words arrive next and
              // describe it, so the phone should already be acting.
              const { action } = event;
              patch({ device: { action, status: 'running', detail: null } });
              if (action.kind === 'call') {
                // A quick-call favourite rings after a cancellable countdown. Anyone
                // else is looked up and STOPS at the confirm card.
                matchFavourite(action.name, action.number)
                  .then(async (favourite) => {
                    if (favourite) {
                      patch({
                        device: {
                          action,
                          status: 'countdown',
                          detail: null,
                          candidates: [favourite],
                          deadline: Date.now() + COUNTDOWN_MS,
                        },
                      });
                      startCountdown(id, favourite);
                      return;
                    }
                    const candidates = await findCallee(action);
                    patch({ device: { action, status: 'confirm', detail: null, candidates } });
                  })
                  .catch((err: unknown) =>
                    patch({ device: { action, status: 'failed', detail: reason(err) } })
                  );
              } else if (action.kind === 'notify.read') {
                // Read and spoken here, on the phone — the messages never reach maestro.
                phoneSpeaks = true;
                readMessages(action.from)
                  .then((conversations) => {
                    const count = conversations.length;
                    patch({
                      device: {
                        action,
                        status: 'done',
                        detail: count === 0 ? 'Nothing new' : `${count} chat${count === 1 ? '' : 's'}`,
                        conversations,
                      },
                    });
                    void speech.speak(speakable(conversations, action.from), id);
                  })
                  .catch((err: unknown) => {
                    patch({ device: { action, status: 'failed', detail: reason(err) } });
                    void speech.speak(reason(err), id);
                  });
              } else if (action.kind === 'notify.reply') {
                // Stops at the reply card, like a call — nothing is sent on maestro's word.
                replyTargets(action.to)
                  .then((conversations) =>
                    patch({ device: { action, status: 'confirm', detail: null, conversations } })
                  )
                  .catch((err: unknown) =>
                    patch({ device: { action, status: 'failed', detail: reason(err) } })
                  );
              } else if (action.kind === 'alarm.stop') {
                stopAlarm(action.snooze)
                  .then((detail) => patch({ device: { action, status: 'done', detail } }))
                  .catch((err: unknown) =>
                    patch({ device: { action, status: 'failed', detail: reason(err) } })
                  );
              } else {
                performDeviceAction(action)
                  .then((detail) => patch({ device: { action, status: 'done', detail } }))
                  .catch((err: unknown) =>
                    patch({ device: { action, status: 'failed', detail: reason(err) } })
                  );
              }
            } else if (event.kind === 'quiz') {
              patch({ quiz: event.card });
            } else if (event.kind === 'todos') {
              syncTodos(turnLane).catch((err: unknown) => console.warn('[todos] sync failed', err));
            } else {
              patch({ status: event.message, phase: event.phase });
            }
          },
        });
        if (!answered) {
          patch({ status: null, phase: null, error: 'Igris closed the connection without answering.' });
        }
      } catch (err) {
        patch({
          status: null,
          phase: null,
          error:
            err instanceof AuthError
              ? 'Your session ended. Sign out and back in.'
              : err instanceof Error
                ? err.message
                : 'Could not reach Igris.',
        });
      } finally {
        setBusy(false);
      }
    },
    [lane, lanePref, refreshLane, sessionId, speech, turns, confirmCall, confirmReply, cancelCall, startCountdown]
  );

  // Start on a todo's alarm screen (src/app/todo.tsx): a fresh conversation, opened
  // with the session's brief. Two steps, because `ask` must see the NEW sessionId —
  // the brief waits in a ref until the session switch has rendered.
  // The todo travels with the first message, so maestro's tutor marks that slot done
  // when the session finishes (maestro tutor/session.py).
  const startAfterSwitch = useRef<SessionStart | null>(null);
  useEffect(() => {
    const consume = () => {
      const start = takeSessionStart();
      if (!start) return;
      startAfterSwitch.current = start;
      void startSession();
    };
    consume();
    return onSessionStart(consume);
  }, [startSession]);
  useEffect(() => {
    const start = startAfterSwitch.current;
    if (!start || !sessionIsNew) return;
    startAfterSwitch.current = null;
    void ask(`Start my session: ${start.title || start.brief}`, {
      todoSession: { todo_id: start.todoId, occurrence_at: start.occurrence },
    });
  }, [sessionId, sessionIsNew, ask]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={[styles.fill, { paddingBottom: bottomInset }]}>
        {/* Modern Glass Header Bar */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <PressableScale
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDrawerOpen(true);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
              style={styles.headerIconButton}>
              <Menu size={16} color={Palette.text} />
            </PressableScale>
            <IgrisMark size={22} tint={lanePref} />
            <Title style={styles.headerTitle}>Igris</Title>
          </View>

          <View style={styles.headerActions}>
            {/* Whole-conversation copy, for eval sets and prompt reviews. Icon-only:
                the header already carries three labelled pills, and it only exists
                once there is something to copy. */}
            {turns.length > 0 ? (
              <PressableScale
                onPress={async () => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  await Clipboard.setStringAsync(formatTranscript(turns, sessionId));
                  setCopiedChat(true);
                  setTimeout(() => setCopiedChat(false), 2000);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={copiedChat ? 'Conversation copied' : 'Copy whole conversation'}
                style={styles.headerIconButton}>
                {copiedChat ? (
                  <Check size={14} color={laneColor(lanePref)} />
                ) : (
                  <Copy size={14} color={Palette.text} />
                )}
              </PressableScale>
            ) : null}

            <LaneBadge
              lane={lane}
              probing={probing}
              pinned={lanePref !== 'auto'}
              reachable={laneReachable}
              onPress={() => setLaneMenuOpen(true)}
            />
          </View>
        </View>

        <ScrollView
          ref={scroller}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
          keyboardDismissMode="on-drag">
          {turns.length === 0 && history !== 'ready' ? (
            <Opening tint={lanePref} error={history === 'loading' ? null : history.error} />
          ) : turns.length === 0 ? (
            <Empty
              lane={lane}
              tint={lanePref}
              reachable={laneReachable}
              busy={busy}
              onPick={ask}
              onQuickCall={quickCall}
              onSignOut={() => void signOut()}
            />
          ) : (
            turns.map((turn, i) => (
              <Turn
                key={turn.id}
                turn={turn}
                onCall={confirmCall}
                onReply={confirmReply}
                onCancelCall={cancelCall}
                onAnswer={i === turns.length - 1 && !busy ? (text) => void ask(text) : undefined}
              />
            ))
          )}
        </ScrollView>

        <Composer
          lane={lane}
          busy={busy}
          onSend={(m) => void ask(m)}
          voice={{
            available: listening.available,
            state: listening.state,
            start: () => void listening.start((text) => void ask(text)),
            stop: () => void listening.stop(),
          }}
        />
      </View>

      <Sessions
        visible={browsing}
        lane={lane}
        currentId={sessionId}
        onOpen={(id) => {
          setBrowsing(false);
          void openSession(id);
        }}
        onNew={() => {
          setBrowsing(false);
          void startSession();
        }}
        onClose={() => setBrowsing(false)}
      />

      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenVoice={() => router.push('/voice')}
        onOpenChats={() => setBrowsing(true)}
        onOpenTodos={() => router.push('/todos')}
        onOpenFavourites={() => router.push('/favourites')}
        onNewConversation={() => void startSession()}
        onSignOut={() => void signOut()}
        lane={lane}
        lanePref={lanePref}
        reachable={laneReachable}
        onOpenLaneMenu={() => setLaneMenuOpen(true)}
      />

      <LaneMenu
        visible={laneMenuOpen}
        lane={lane}
        lanePref={lanePref}
        reachable={laneReachable}
        onChoose={(pref) => void chooseLane(pref)}
        onClose={() => setLaneMenuOpen(false)}
      />
    </SafeAreaView>
  );
}

function Opening({ tint, error }: { tint: Tint; error: string | null }) {
  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.openingContainer}>
      {error ? (
        <Answer style={styles.openingError}>{`Couldn't open that conversation. ${error}`}</Answer>
      ) : (
        <>
          <IgrisLoader tint={tint} state="thinking" size={56} />
          <Meta style={styles.openingText}>Opening conversation…</Meta>
        </>
      )}
    </Animated.View>
  );
}

function Empty({
  lane,
  tint,
  reachable,
  busy,
  onPick,
  onQuickCall,
  onSignOut,
}: {
  lane: Lane;
  /** The mode colour — Auto, or the pinned lane. See Tint in theme.ts. */
  tint: Tint;
  /** False when the user pinned a lane that is not answering. */
  reachable: boolean;
  busy: boolean;
  onPick: (message: string) => void;
  onQuickCall: (favourite: Favourite) => void;
  onSignOut: () => void;
}) {
  const accent = laneColor(tint);
  const favourites = useFavourites();

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyContainer}>
      {/* Central Interactive AI Core */}
      <View style={styles.coreWrapper}>
        <IgrisLoader tint={tint} state={busy ? 'thinking' : 'idle'} size={110} breathe />
      </View>

      {/* Before lanes could be pinned, lane === 'local' implied the Mac had answered
          a probe. A pin breaks that: the lane is local because you said so, not
          because anything is listening. So "connected" has to check reachability,
          or it claims a live Mac in exactly the state the pin warning exists for. */}
      <Answer style={styles.emptyLede}>
        {lane === 'cloud'
          ? 'Operating via Render Cloud. System tools limited, answers may take ~30s.'
          : reachable
            ? 'Connected to the Mac. All system tools active.'
            : 'Pinned to the Mac, but it is not answering. Wake it, or switch lanes above.'}
      </Answer>

      {/* Quick call: favourites ring on one tap. Managed on /favourites. */}
      <View style={styles.openersSection}>
        <View style={[styles.sectionHead, favourites.length === 0 && styles.centred]}>
          <Meta style={styles.openersTitle}>QUICK CALL</Meta>
          {favourites.length > 0 ? (
            <PressableScale
              onPress={() => router.push('/favourites')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Manage quick-call contacts">
              <Meta style={[styles.sectionLink, { color: accent }]}>Edit</Meta>
            </PressableScale>
          ) : null}
        </View>
        <View style={styles.callChips}>
          {favourites.map((favourite) => (
            <PressableScale
              key={favourite.number}
              onPress={() => onQuickCall(favourite)}
              accessibilityRole="button"
              accessibilityLabel={`Call ${favourite.name}`}
              style={[styles.callChip, { borderColor: accent + '44' }]}>
              <View style={[styles.callChipAvatar, { backgroundColor: accent + '22' }]}>
                <Text style={[styles.callChipInitial, { color: accent }]}>
                  {favourite.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.callChipName} numberOfLines={1}>
                {favourite.alias ? capitalise(favourite.alias) : favourite.name.split(/\s+/)[0]}
              </Text>
            </PressableScale>
          ))}
          {favourites.length === 0 ? (
            <PressableScale
              onPress={() => router.push('/favourites')}
              accessibilityRole="button"
              style={[styles.callChip, styles.callChipAdd]}>
              <Plus size={14} color={Palette.muted} />
              <Text style={styles.callChipAddText}>Add people Igris can call instantly</Text>
            </PressableScale>
          ) : null}
        </View>
      </View>

      {/* Suggested Quick Openers */}
      <View style={styles.openersSection}>
        <Meta style={styles.openersTitle}>QUICK COMMANDS</Meta>
        <View style={styles.openersGrid}>
          {OPENERS.map((opener, idx) => {
            const IconComp = opener.icon;
            return (
              <Animated.View
                key={opener.text}
                entering={FadeInDown.delay(100 * idx).springify()}>
                <PressableScale
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onPick(opener.text);
                  }}
                  accessibilityRole="button"
                  style={styles.openerCard}>
                  <View style={[styles.openerIconBox, { backgroundColor: accent + '1E' }]}>
                    <IconComp size={15} color={accent} />
                  </View>
                  <Text style={styles.openerText}>{opener.text}</Text>
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>
      </View>

      <PressableScale
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSignOut();
        }}
        accessibilityRole="button"
        style={styles.signOutButton}>
        <LogOut size={13} color={Palette.faint} />
        <Meta style={styles.signOutText}>Sign out session</Meta>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  centred: { justifyContent: 'center' },
  sectionLink: {
    fontSize: 12,
    fontFamily: Font.uiMedium,
  },
  callChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Space.sm,
  },
  callChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingLeft: 6,
    paddingRight: Space.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: Palette.surface,
    maxWidth: '100%',
  },
  callChipAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callChipInitial: {
    fontFamily: Font.uiMedium,
    fontSize: 13,
  },
  callChipName: {
    color: Palette.text,
    fontFamily: Font.ui,
    fontSize: 14,
    flexShrink: 1,
  },
  callChipAdd: {
    borderColor: Palette.hairlineBright,
    borderStyle: 'dashed',
    paddingLeft: Space.md,
  },
  callChipAddText: {
    color: Palette.muted,
    fontFamily: Font.ui,
    fontSize: 13,
  },
  screen: { flex: 1, backgroundColor: Palette.ground },
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
    backgroundColor: Palette.ground,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  headerTitle: {
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    fontSize: 24,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  headerIconButton: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: Space.md, paddingBottom: Space.xl },
  emptyContainer: {
    paddingHorizontal: Gutter,
    alignItems: 'center',
    paddingTop: Space.xl,
    gap: Space.xl,
  },
  openingContainer: {
    paddingHorizontal: Gutter,
    alignItems: 'center',
    paddingTop: Space.huge * 2,
    gap: Space.lg,
  },
  openingText: { color: Palette.muted, fontFamily: Font.ui },
  openingError: { color: Palette.alert, textAlign: 'center' },
  coreWrapper: {
    marginVertical: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLede: {
    color: Palette.muted,
    textAlign: 'center',
    maxWidth: 340,
    fontSize: 15,
    lineHeight: 23,
  },
  openersSection: {
    width: '100%',
    gap: Space.sm,
    marginTop: Space.md,
  },
  openersTitle: {
    fontSize: 10,
    letterSpacing: 1.2,
    color: Palette.faint,
    textAlign: 'center',
  },
  openersGrid: {
    gap: Space.sm,
  },
  openerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: 16,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  openerIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openerText: {
    fontFamily: Font.ui,
    color: Palette.text,
    ...Type.ask,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.lg,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
  },
  signOutText: {
    color: Palette.faint,
  },
});

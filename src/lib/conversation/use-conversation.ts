import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';

import { callContact, type Contact, type Conversation, type DeviceStep } from '@/lib/device';
import { COUNTDOWN_MS, type Favourite } from '@/lib/favourites';
import { isEmergency } from '@/lib/emergency';
import { AuthError, splitDrawn, streamChat, type Photo } from '@/lib/maestro';
import { sendReply } from '@/lib/notifications';
import { threadMessages } from '@/lib/threads';
import { onSessionStart, syncTodos, takeSessionStart, type SessionStart } from '@/lib/todos';
import { autoSpeakOn } from '@/lib/voice/auto-speak';
import { useSpeech } from '@/lib/voice/use-speech';
import { useSession } from '@/state/session';

import { reason, runDeviceAction } from './device-steps';
import { blankTurn, type TurnState } from './turn-state';

/** Answers to a pending call or reply card, typed or spoken. Whole-message matches only. */
const YES = /^(yes|yeah|yep|haan|han|ha|ok|okay|sure|go ahead|do it|call|call (him|her|them)|send|send it)[.!]*$/i;
const NO = /^(no|nope|nahi|na|cancel|don'?t|stop)[.!]*$/i;

export type AskExtra = { todoSession?: { todo_id: string; occurrence_at: string | null }; photo?: Photo };

/**
 * The open conversation: its turns, loading its history, asking Igris, and the phone
 * actions a turn can wait on (a call, a countdown, a reply). The transcript screen
 * (app/index.tsx) only draws what this returns.
 */
export function useConversation() {
  const { lane, probing, lanePref, refreshLane, sessionId, sessionIsNew, startSession } = useSession();
  const speech = useSpeech();
  const [turns, setTurns] = useState<TurnState[]>([]);
  const [busy, setBusy] = useState(false);

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
            restored.push(blankTurn(`${message.created_at}-${restored.length}`, message.content, lane));
          } else if (restored.length > 0) {
            const { text, drawn } = splitDrawn(message.content);
            restored[restored.length - 1].answer = text;
            restored[restored.length - 1].drawn = drawn;
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
        blankTurn(id, `Call ${favourite.name}`, lane, {
          device: {
            action: { kind: 'call', name: favourite.name, number: null },
            status: 'running',
            detail: null,
            candidates: [favourite],
          },
        }),
      ]);
      void confirmCall(id, favourite);
    },
    [lane, confirmCall]
  );

  const ask = useCallback(
    async (message: string, extra?: AskExtra) => {
      // An emergency is answered here and now: no pending card, no lane probe, no
      // network. The card's buttons work with the Mac asleep and Render cold.
      if (!extra?.photo && isEmergency(message)) {
        const id = `${Date.now()}`;
        const answer = 'Tap 112 to call for help. Your location can go by SMS below.';
        setTurns((prev) => [...prev, blankTurn(id, message, lane, { answer, sos: true, elapsedMs: 0 })]);
        void speech.speak('Tap one one two to call for help.', id);
        return;
      }

      // A reply to a pending call card is answered here, on the phone — sending "yes"
      // to maestro would only get it classified as chit-chat. Only for a single
      // candidate: "yes" to a list of three Rahuls would be a guess.
      const pending = [...turns]
        .reverse()
        .find((t) => t.device?.status === 'confirm' || t.device?.status === 'countdown');
      const step = pending?.device;
      if (pending && step && !extra?.photo && YES.test(message.trim())) {
        if (step.action.kind === 'notify.reply' && step.conversations?.length === 1) {
          return void confirmReply(pending.id, step.conversations[0], step.action.text);
        }
        if (step.candidates?.length === 1) return void confirmCall(pending.id, step.candidates[0]);
      }
      if (pending && !extra?.photo && NO.test(message.trim())) return cancelCall(pending.id);

      // Auto on Render may be stale: one probe that caught the Mac mid-restart kept the
      // app on Render for the rest of the session, and Render's maestro lacks the Mac's
      // tools (device actions, dhaba). Ask the Mac again before settling for Render —
      // tens of ms on the tailnet, at most PROBE_TIMEOUT_MS when it really is asleep.
      const turnLane = lanePref === 'auto' && lane === 'cloud' ? await refreshLane() : lane;

      const id = `${Date.now()}`;
      const startedAt = Date.now();

      setTurns((prev) => [
        ...prev,
        blankTurn(id, message, turnLane, {
          status: 'Igris is thinking…',
          phase: 'thinking',
          photo: extra?.photo?.uri ?? null,
        }),
      ]);
      setBusy(true);
      void speech.stop();

      const patch = (change: Partial<TurnState>) =>
        setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...change } : t)));

      try {
        // The lane can change between attaching and sending (Auto, a sleeping Mac).
        if (extra?.photo && turnLane !== 'local') {
          throw new Error('Photos need the Mac, and Igris is on Render right now. Try again when the Mac is back.');
        }
        let answered = false;
        // Set when the phone itself will speak this turn (reading messages aloud),
        // so maestro's "checking your messages" does not talk over it.
        let phoneSpeaks = false;
        await streamChat({
          lane: turnLane,
          message,
          sessionId,
          todoSession: extra?.todoSession,
          image: extra?.photo?.base64,
          onEvent: (event) => {
            if (event.kind === 'answer') {
              answered = true;
              patch({
                answer: event.message,
                status: null,
                phase: null,
                elapsedMs: Date.now() - startedAt,
              });
              if (!phoneSpeaks && autoSpeakOn()) void speech.speak(event.message, id);
            } else if (event.kind === 'device') {
              phoneSpeaks =
                runDeviceAction(event.action, {
                  setStep: (device) => patch({ device }),
                  speak: (text) => void speech.speak(text, id),
                  startCountdown: (favourite) => startCountdown(id, favourite),
                }) || phoneSpeaks;
            } else if (event.kind === 'drawn') {
              patch({ drawn: event.picture });
            } else if (event.kind === 'bill') {
              patch({ bill: event.card });
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

  return { turns, busy, history, ask, quickCall, confirmCall, confirmReply, cancelCall };
}

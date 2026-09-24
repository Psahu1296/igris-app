import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { login, probeLane, type Lane, type LanePreference } from '@/lib/maestro';
import { newThreadId } from '@/lib/threads';
import * as secure from '@/lib/secure';

type Status = 'loading' | 'signed-out' | 'signed-in';

type SessionValue = {
  status: Status;
  lane: Lane;
  /** True while a probe is deciding which brain to use. */
  probing: boolean;
  /** What the user asked for. 'auto' means the probe decides. */
  lanePref: LanePreference;
  /** Pin a lane by hand, or hand control back to the probe with 'auto'. */
  chooseLane: (pref: LanePreference) => Promise<void>;
  /** False only when a PINNED lane failed its health probe. */
  laneReachable: boolean;
  /** The open conversation. maestro uses this verbatim as the owner's thread_id. */
  sessionId: string;
  /**
   * True for a thread this device just minted (launch, New Conversation), which by
   * construction has no history on the server — so there is nothing to fetch. False
   * once a thread is opened from Chats.
   */
  sessionIsNew: boolean;
  /** Open an existing conversation by its thread_id. */
  openSession: (id: string) => Promise<void>;
  /** Begin a fresh conversation, with its own memory on maestro's side. */
  startSession: () => Promise<string>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-decide the lane now; resolves with the lane requests will use. */
  refreshLane: () => Promise<Lane>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [lane, setLane] = useState<Lane>('cloud');
  const [probing, setProbing] = useState(false);
  const [lanePref, setLanePref] = useState<LanePreference>('auto');
  const [laneReachable, setLaneReachable] = useState(true);
  // Every launch opens a NEW conversation. Igris is summoned for one question at a
  // time, and resuming yesterday's thread meant a new ask carried old context into
  // maestro's memory without you seeing it. Old threads are one tap away in Chats.
  //
  // Nothing is persisted: the id is only written server-side once a message is sent
  // (chat_logs), so launching and leaving creates no empty thread in the list. The
  // cost is that the phone no longer continues the Mac voice loop's `voice-v2` thread
  // by default — open it from Chats to do that.
  const [session, setSession] = useState(() => ({ id: newThreadId(), fresh: true }));
  const sessionId = session.id;
  const sessionIsNew = session.fresh;

  const openSession = useCallback(async (id: string) => {
    setSession({ id, fresh: false });
  }, []);

  const startSession = useCallback(async () => {
    const id = newThreadId();
    setSession({ id, fresh: true });
    return id;
  }, []);

  /**
   * Takes the preference as an argument rather than reading state, so it has no
   * dependencies and cannot be called with a stale one — it runs during start-up,
   * before setLanePref has committed, and again from chooseLane in the same tick.
   */
  const resolveLane = useCallback(async (pref: LanePreference): Promise<Lane> => {
    setProbing(true);
    try {
      if (pref === 'auto') {
        const probed = await probeLane();
        setLane(probed);
        setLaneReachable(true);
        return probed;
      }

      // A pinned lane is honoured whether or not it answers. Overruling the probe
      // is the entire point of pinning, and silently bouncing the user back to
      // Render would make the menu feel broken. We still probe — but only so the
      // badge can say the Mac is asleep instead of letting every turn time out.
      setLane(pref);
      setLaneReachable(pref === 'cloud' ? true : (await probeLane()) === 'local');
      return pref;
    } finally {
      setProbing(false);
    }
  }, []);

  const refreshLane = useCallback(() => resolveLane(lanePref), [resolveLane, lanePref]);

  const chooseLane = useCallback(
    async (pref: LanePreference) => {
      setLanePref(pref);
      await secure.saveLanePref(pref);
      await resolveLane(pref);
    },
    [resolveLane]
  );

  useEffect(() => {
    (async () => {
      const [creds, pref] = await Promise.all([secure.loadCredentials(), secure.loadLanePref()]);
      setLanePref(pref);
      setStatus(creds ? 'signed-in' : 'signed-out');
      if (creds) await resolveLane(pref);
      else setProbing(false);
    })();
  }, [resolveLane]);

  // The Mac sleeps and wakes without telling us, so the lane a probe chose ten
  // minutes ago is not evidence about now. Re-probe whenever the app comes back
  // to the foreground, which for a gesture-summoned assistant is every use.
  useEffect(() => {
    if (status !== 'signed-in') return;
    // Worth doing even when a lane is pinned: it is how a pinned Mac notices it has
    // woken up, and how the badge stops claiming it is unreachable.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshLane();
    });
    return () => sub.remove();
  }, [status, refreshLane]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      // Honour a pin here too, or signing in would quietly log you into the lane
      // you explicitly told the app not to use.
      const target = lanePref === 'auto' ? await probeLane() : lanePref;
      await login(target, username, password);
      await secure.saveCredentials({ username, password });
      setLane(target);
      setStatus('signed-in');
    },
    [lanePref]
  );

  const signOut = useCallback(async () => {
    await secure.clearAll();
    setSession({ id: newThreadId(), fresh: true });
    setLanePref('auto');
    setLaneReachable(true);
    setStatus('signed-out');
  }, []);

  const value = useMemo(
    () => ({
      status,
      lane,
      probing,
      lanePref,
      laneReachable,
      chooseLane,
      sessionId,
      sessionIsNew,
      openSession,
      startSession,
      signIn,
      signOut,
      refreshLane,
    }),
    [
      status,
      lane,
      probing,
      lanePref,
      laneReachable,
      chooseLane,
      sessionId,
      sessionIsNew,
      openSession,
      startSession,
      signIn,
      signOut,
      refreshLane,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

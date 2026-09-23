import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { SESSION_ID } from '@/lib/config';
import { login, probeLane, type Lane } from '@/lib/maestro';
import { newThreadId } from '@/lib/threads';
import * as secure from '@/lib/secure';

type Status = 'loading' | 'signed-out' | 'signed-in';

type SessionValue = {
  status: Status;
  lane: Lane;
  /** True while a probe is deciding which brain to use. */
  probing: boolean;
  /** The open conversation. maestro uses this verbatim as the owner's thread_id. */
  sessionId: string;
  /** Open an existing conversation by its thread_id. */
  openSession: (id: string) => Promise<void>;
  /** Begin a fresh conversation, with its own memory on maestro's side. */
  startSession: () => Promise<string>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshLane: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [lane, setLane] = useState<Lane>('cloud');
  const [probing, setProbing] = useState(false);
  const [sessionId, setSessionId] = useState<string>(SESSION_ID);

  // Restore the conversation that was open last, so reopening the app does not
  // silently start talking into a different thread than the one on screen before.
  useEffect(() => {
    void secure.loadSession().then((saved) => {
      if (saved) setSessionId(saved);
    });
  }, []);

  const openSession = useCallback(async (id: string) => {
    setSessionId(id);
    await secure.saveSession(id);
  }, []);

  const startSession = useCallback(async () => {
    const id = newThreadId();
    setSessionId(id);
    await secure.saveSession(id);
    return id;
  }, []);

  const refreshLane = useCallback(async () => {
    setProbing(true);
    try {
      setLane(await probeLane());
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const creds = await secure.loadCredentials();
      setStatus(creds ? 'signed-in' : 'signed-out');
      if (creds) await refreshLane();
      else setProbing(false);
    })();
  }, [refreshLane]);

  // The Mac sleeps and wakes without telling us, so the lane a probe chose ten
  // minutes ago is not evidence about now. Re-probe whenever the app comes back
  // to the foreground, which for a gesture-summoned assistant is every use.
  useEffect(() => {
    if (status !== 'signed-in') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refreshLane();
    });
    return () => sub.remove();
  }, [status, refreshLane]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      const target = await probeLane();
      await login(target, username, password);
      await secure.saveCredentials({ username, password });
      setLane(target);
      setStatus('signed-in');
    },
    []
  );

  const signOut = useCallback(async () => {
    await secure.clearAll();
    setSessionId(SESSION_ID);
    setStatus('signed-out');
  }, []);

  const value = useMemo(
    () => ({ status, lane, probing, sessionId, openSession, startSession, signIn, signOut, refreshLane }),
    [status, lane, probing, sessionId, openSession, startSession, signIn, signOut, refreshLane]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

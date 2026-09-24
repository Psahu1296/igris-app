/** Which brain answers: the Mac on the tailnet or LAN, or Render. */
export type Lane = 'local' | 'cloud';

/**
 * What the user asked for, as distinct from what a probe found. 'auto' leaves the
 * choice to probeLane(); pinning a lane means the user overrules the probe and keeps
 * overruling it across restarts, which is the whole point of pinning.
 */
export type LanePreference = 'auto' | Lane;

/**
 * Lane endpoints. EXPO_PUBLIC_* is inlined into the JS bundle at build time, so
 * only non-secret values may live here — credentials go to SecureStore at runtime.
 */

export const LOCAL_URL = process.env.EXPO_PUBLIC_MAESTRO_LOCAL_URL ?? '';

export const CLOUD_URL =
  process.env.EXPO_PUBLIC_MAESTRO_CLOUD_URL ?? 'https://maestro-hvdz.onrender.com';

/**
 * How long we wait for the Mac before giving up and using Render. Deliberately
 * short: on the tailnet /health answers in tens of milliseconds, so anything
 * approaching a second means the Mac is asleep and we should stop waiting.
 */
export const PROBE_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_LANE_PROBE_TIMEOUT_MS ?? 1500);

export const urlFor = (lane: Lane) => (lane === 'local' ? LOCAL_URL : CLOUD_URL);

// There used to be a SESSION_ID here (EXPO_PUBLIC_MAESTRO_SESSION_ID, default
// 'voice-v2') that the phone resumed on launch to share the Mac voice loop's thread.
// Since 2026-09-24 every launch starts a new thread (state/session.tsx), and
// `voice-v2` is opened from Chats like any other. Do not bring back `voice`: that
// thread was retired on 2026-06-18 with poisoned memory, and maestro resumes it.

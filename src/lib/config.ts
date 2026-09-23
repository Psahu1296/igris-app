/** Which brain answers: the Mac over Tailscale, or Render. */
export type Lane = 'local' | 'cloud';

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

/**
 * maestro derives thread_id from the session role, and for the OWNER role it uses
 * whatever session_id the client sends (main.py::_thread_config). So this value
 * decides whether the phone continues the same conversation as the Mac voice loop
 * or starts its own: set it to match MAESTRO_SESSION_ID in maestro's .env to share
 * one continuous Igris across every surface.
 *
 * Defaults to 'voice-v2', matching maestro's current MAESTRO_SESSION_ID. Do NOT
 * use 'voice': that thread was retired on 2026-06-18 because its memory was
 * poisoned with a hallucinated answer, and maestro would happily resume it.
 */
export const SESSION_ID = process.env.EXPO_PUBLIC_MAESTRO_SESSION_ID ?? 'voice-v2';

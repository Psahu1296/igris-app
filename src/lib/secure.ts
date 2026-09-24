import * as SecureStore from 'expo-secure-store';

import type { Lane, LanePreference } from '@/lib/maestro';

/**
 * Credential storage, backed by the Android Keystore.
 *
 * We keep the password, not just the token, and that is deliberate. maestro has
 * ONE session_token column per credential row (demo_auth.py), so signing into
 * ai-playground during an interview silently evicts the phone's session. Without
 * the password on hand the phone would demand you retype your master password
 * mid-demo; with it, the 401 handler re-logs in and you never notice.
 */

const USERNAME = 'igris.username';
const PASSWORD = 'igris.password';
const tokenKey = (lane: Lane) => `igris.token.${lane}`;
// Not a secret, but it lives here so it is cleared with everything else on sign-out.
const LANE_PREF = 'igris.lane';
// Builds before 2026-09-24 restored the last-open thread from here. Nothing writes it
// now (every launch starts a new conversation); it is only cleared, for old installs.
const LEGACY_SESSION = 'igris.session';

export type Credentials = { username: string; password: string };

export async function saveCredentials({ username, password }: Credentials) {
  await SecureStore.setItemAsync(USERNAME, username);
  await SecureStore.setItemAsync(PASSWORD, password);
}

export async function loadCredentials(): Promise<Credentials | null> {
  const username = await SecureStore.getItemAsync(USERNAME);
  const password = await SecureStore.getItemAsync(PASSWORD);
  return username && password ? { username, password } : null;
}

export const saveToken = (lane: Lane, token: string) =>
  SecureStore.setItemAsync(tokenKey(lane), token);

export const loadToken = (lane: Lane) => SecureStore.getItemAsync(tokenKey(lane));

export const clearToken = (lane: Lane) => SecureStore.deleteItemAsync(tokenKey(lane));

export const saveLanePref = (pref: LanePreference) => SecureStore.setItemAsync(LANE_PREF, pref);

/** Anything unrecognised — including a value from an older build — means 'auto'. */
export async function loadLanePref(): Promise<LanePreference> {
  const saved = await SecureStore.getItemAsync(LANE_PREF);
  return saved === 'local' || saved === 'cloud' ? saved : 'auto';
}

export async function clearAll() {
  await Promise.all([
    SecureStore.deleteItemAsync(USERNAME),
    SecureStore.deleteItemAsync(PASSWORD),
    SecureStore.deleteItemAsync(LEGACY_SESSION),
    SecureStore.deleteItemAsync(LANE_PREF),
    clearToken('local'),
    clearToken('cloud'),
  ]);
}

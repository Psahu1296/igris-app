import * as SecureStore from 'expo-secure-store';

import type { Lane } from '@/lib/maestro';

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

export async function clearAll() {
  await Promise.all([
    SecureStore.deleteItemAsync(USERNAME),
    SecureStore.deleteItemAsync(PASSWORD),
    clearToken('local'),
    clearToken('cloud'),
  ]);
}

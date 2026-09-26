import * as Updates from 'expo-updates';

import IgrisDevice from '../../modules/igris-device';

/**
 * Keeping Igris current, both ways it changes:
 *
 * - JS (OTA): expo-updates downloads a new bundle on launch and runs it on the NEXT
 *   launch, silently. checkOta() does the same on demand and applyOta() restarts into it.
 * - Native (APK): a JS bundle cannot add native code, so a release that does (new
 *   permissions, a new module) is a new APK on GitHub Releases. checkApk() compares the
 *   latest release's tag with the installed versionName; installApk() downloads it and
 *   opens Android's installer (modules/igris-device AppUpdater.kt).
 *
 * The release build is com.psahu.igris. The dev build (.dev) gets its JS from Metro and
 * would install the release APK as a second app, so it is never offered one.
 */

const REPO = 'Psahu1296/igris-app';
const RELEASE_PACKAGE = 'com.psahu.igris';

export type Installed = { versionName: string; versionCode: number; packageName: string };
export type Release = { version: string; tag: string; apkUrl: string; bytes: number; notes: string; publishedAt: string };

export function installed(): Installed | null {
  try {
    return IgrisDevice?.appVersion() ?? null;
  } catch {
    return null;
  }
}

export const isReleaseBuild = () => installed()?.packageName === RELEASE_PACKAGE;

/** "1.10.0" > "1.9.2". Pre-release suffixes ("-build.7") compare as older than the release. */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/, '').split('-', 2);
    return { nums: core.split('.').map((n) => parseInt(n, 10) || 0), pre: pre ?? null };
  };
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i++) {
    const d = (a.nums[i] ?? 0) - (b.nums[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return b.pre !== null && a.pre === null;
}

/** The newest published release (GitHub's "latest" skips prereleases and drafts). */
export async function latestRelease(): Promise<Release | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) return null; // no release yet
  if (!res.ok) throw new Error(`GitHub answered ${res.status} when checking for updates.`);
  const body = await res.json();
  const apk = (body.assets ?? []).find((a: { name: string }) => a.name.endsWith('.apk'));
  if (!apk) return null;
  return {
    version: String(body.tag_name).replace(/^v/, ''),
    tag: body.tag_name,
    apkUrl: apk.browser_download_url,
    bytes: apk.size,
    notes: body.body ?? '',
    publishedAt: body.published_at,
  };
}

/** A release newer than this build, or null. Always null on the dev build. */
export async function checkApk(): Promise<Release | null> {
  const me = installed();
  if (!me || me.packageName !== RELEASE_PACKAGE) return null;
  const latest = await latestRelease();
  return latest && isNewer(latest.version, me.versionName) ? latest : null;
}

export async function installApk(release: Release): Promise<void> {
  if (!IgrisDevice) throw new Error('This build cannot install updates. Install the new APK once by hand.');
  if (!IgrisDevice.canInstallUpdates()) {
    // Android asks once per app: Settings › Install unknown apps › Igris.
    IgrisDevice.openInstallPermission();
    throw new Error('Allow "Install unknown apps" for Igris, come back, and tap Update again.');
  }
  await IgrisDevice.downloadAndInstall(release.apkUrl);
}

export type OtaState = 'disabled' | 'current' | 'ready';

/** Downloads a waiting JS update, if any. 'ready' means applyOta() will run it. */
export async function checkOta(): Promise<OtaState> {
  if (!Updates.isEnabled) return 'disabled'; // dev build: Metro serves the JS
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return 'current';
  const fetched = await Updates.fetchUpdateAsync();
  return fetched.isNew ? 'ready' : 'current';
}

export const applyOta = () => Updates.reloadAsync();

/** What is running now, for the Updates screen. */
export function runningBundle() {
  return {
    runtimeVersion: Updates.runtimeVersion,
    channel: Updates.channel,
    updateId: Updates.updateId,
    createdAt: Updates.createdAt,
    embedded: Updates.isEmbeddedLaunch,
  };
}

import { Directory, File, Paths } from 'expo-file-system';

import type { AssetSpec } from '@/lib/assets/manifest';

/**
 * On-device model storage.
 *
 * Models live in the document directory, not the cache: Android may purge the
 * cache under storage pressure, and silently losing a 63MB voice would look like
 * Igris going mute for no reason.
 */

export type AssetState = 'missing' | 'ready' | 'damaged';

const MODELS = 'models';

export function modelsDir(): Directory {
  const dir = new Directory(Paths.document, MODELS);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export const fileFor = (spec: AssetSpec) => new File(modelsDir(), spec.file);

/** Absolute file:// uri, which is what a model loader needs. */
export const uriFor = (spec: AssetSpec) => fileFor(spec).uri;

/**
 * A file is only "ready" if it is exactly the size we expect AND hashes to the
 * value in the manifest. Size alone passes a file that finished downloading but
 * arrived mangled; hash alone costs a full read on every check, so size is the
 * cheap gate that runs first.
 */
export function inspect(spec: AssetSpec): AssetState {
  const file = fileFor(spec);
  if (!file.exists) return 'missing';
  if (file.size !== spec.bytes) return 'damaged';
  const hash = file.md5;
  // A null hash means the file could not be read, which is itself a failure.
  if (hash === null || hash.toLowerCase() !== spec.md5.toLowerCase()) return 'damaged';
  return 'ready';
}

export function remove(spec: AssetSpec) {
  const file = fileFor(spec);
  if (file.exists) file.delete();
}

export type DownloadHandle = {
  promise: Promise<void>;
  cancel: () => void;
};

/**
 * Download one asset, replacing whatever is there.
 *
 * Returns a handle rather than a bare promise so the screen can cancel a 63MB
 * transfer — on a phone that is on mobile data, that is not a theoretical need.
 */
export function download(
  spec: AssetSpec,
  onProgress: (bytesWritten: number, totalBytes: number) => void
): DownloadHandle {
  // Clear any previous attempt first: createDownloadTask has no overwrite option,
  // and a retry after a corrupt download must not fail on the leftover file.
  remove(spec);

  const destination = fileFor(spec);
  const task = File.createDownloadTask(spec.url, destination, {
    onProgress: ({ bytesWritten, totalBytes }) =>
      onProgress(bytesWritten, totalBytes > 0 ? totalBytes : spec.bytes),
  });

  const promise = (async () => {
    const result = await task.downloadAsync();
    if (result === null) throw new Error('Download paused before finishing.');

    // Verify before declaring success. A half-written model that loads and then
    // crashes the TTS engine is far worse than a download that admits it failed.
    const state = inspect(spec);
    if (state !== 'ready') {
      remove(spec);
      throw new Error(
        state === 'damaged'
          ? `${spec.title} downloaded but arrived corrupt. Try again.`
          : `${spec.title} did not finish downloading.`
      );
    }
  })();

  return { promise, cancel: () => task.cancel() };
}

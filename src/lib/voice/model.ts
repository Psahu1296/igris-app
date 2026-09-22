import { Directory, File } from 'expo-file-system';
import { extractArchive, listBundledArchives } from 'react-native-sherpa-onnx/extraction';

import type { AssetSpec } from '@/lib/assets/manifest';
import { fileFor, modelsDir } from '@/lib/assets/store';

/**
 * Unpacking a downloaded model archive.
 *
 * This lives in the voice layer, not the asset store, because extraction is a
 * sherpa-onnx concern: we use its own native extractor rather than adding a tar
 * or bzip2 dependency to JavaScript, where decompressing 67MB would be painful.
 */

export type ModelState =
  /** Nothing on disk. */
  | 'missing'
  /** Archive downloaded but not yet unpacked. */
  | 'archived'
  /** Unpacked and usable. */
  | 'ready';

/** The directory sherpa-onnx is given as `{ type: 'file', path }`. */
export function modelDir(spec: AssetSpec): Directory {
  return new Directory(modelsDir(), spec.dir ?? spec.id);
}

/** Absolute path, not a file:// uri — the native loader wants a plain path. */
export function modelPath(spec: AssetSpec): string {
  return modelDir(spec).uri.replace(/^file:\/\//, '');
}

export function modelState(spec: AssetSpec): ModelState {
  // Readiness is the unpacked directory, never the archive: we delete the archive
  // after extracting so the phone holds 79MB instead of 146MB.
  const probe = new File(modelDir(spec), spec.probe ?? 'tokens.txt');
  if (probe.exists) return 'ready';
  return fileFor(spec).exists ? 'archived' : 'missing';
}

/**
 * Unpack the downloaded archive and drop it.
 *
 * `listBundledArchives` scans a directory and hands back native descriptors, so
 * we point it at the models directory and pick out the file we just downloaded
 * rather than constructing a descriptor ourselves.
 */
export async function extract(
  spec: AssetSpec,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const target = modelsDir();
  const targetPath = target.uri.replace(/^file:\/\//, '');
  const archives = await listBundledArchives(targetPath);
  const archive = archives.find((a) => a.archivePath.endsWith(spec.file));

  if (!archive) throw new Error(`${spec.title} was downloaded but could not be opened.`);

  await extractArchive(archive, targetPath, {
    force: true,
    onProgress: onProgress ? (event) => onProgress(event.percent / 100) : undefined,
  });

  if (modelState(spec) !== 'ready') {
    throw new Error(`${spec.title} unpacked but is missing files. Download it again.`);
  }

  // The archive has served its purpose. Keeping it doubles the storage cost for
  // no benefit — a re-download is cheaper than 67MB sitting idle forever.
  const archiveFile = fileFor(spec);
  if (archiveFile.exists) archiveFile.delete();
}

export function removeModel(spec: AssetSpec) {
  const dir = modelDir(spec);
  if (dir.exists) dir.delete();
  const archiveFile = fileFor(spec);
  if (archiveFile.exists) archiveFile.delete();
}

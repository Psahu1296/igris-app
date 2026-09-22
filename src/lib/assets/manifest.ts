/**
 * The asset manifest is fetched at runtime, not bundled, so a new model or a
 * changed download URL never requires shipping a new APK (PLAN.md decision #9).
 * `assets/manifest.json` in this repo is the source that gets published.
 */

export type AssetSpec = {
  id: string;
  /**
   * `archive` assets are downloaded, extracted, and then the archive is deleted —
   * sherpa-onnx wants a model *directory* (model, tokens.txt, espeak-ng-data/),
   * not a single file, and keeping both costs 146MB instead of 79MB.
   */
  kind: 'file' | 'archive';
  title: string;
  detail: string;
  /** Downloaded filename. For an archive this file is transient. */
  file: string;
  /** Archive only: the directory the archive unpacks into. */
  dir?: string;
  /** Archive only: a file inside `dir` whose presence means extraction succeeded. */
  probe?: string;
  url: string;
  bytes: number;
  /**
   * Guards against a truncated or corrupt download, not against tampering —
   * HTTPS already covers that. MD5 is what expo-file-system can compute without
   * reading the whole 67MB file into JS memory, which is the real constraint.
   */
  md5: string;
  /** Archive only: roughly what it occupies once unpacked. Shown before download. */
  extractedBytes?: number;
  requiredFor: string;
};

export type Manifest = { version: number; assets: AssetSpec[] };

const MANIFEST_URL =
  process.env.EXPO_PUBLIC_ASSET_MANIFEST_URL ??
  'https://raw.githubusercontent.com/Psahu1296/igris-app/main/assets/manifest.json';

export async function fetchManifest(signal?: AbortSignal): Promise<Manifest> {
  const res = await fetch(MANIFEST_URL, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Could not read the asset list (${res.status}).`);

  const body = (await res.json()) as Manifest;
  if (!Array.isArray(body.assets)) throw new Error('The asset list is malformed.');
  return body;
}

/** What the phone actually ends up storing, which is what a size warning should say. */
export const footprint = (spec: AssetSpec) => spec.extractedBytes ?? spec.bytes;

export const totalBytes = (assets: AssetSpec[]) => assets.reduce((sum, a) => sum + a.bytes, 0);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';

import { drawnSource, type Lane } from '@/lib/maestro';

const ALBUM = 'Igris';

/**
 * Save a picture Igris drew into the phone's gallery, in an "Igris" album.
 *
 * The picture lives on the Mac behind the session token, so it is downloaded to the
 * cache first (MediaLibrary only takes local files), then handed to the gallery, which
 * copies it — the cache file can go. Write-only photo access: Igris never reads the
 * gallery, and Android asks only once.
 *
 * Throws with a sentence the caller shows as it is.
 */
export async function saveDrawn(lane: Lane, name: string): Promise<void> {
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) {
    throw new Error('Igris needs photo access to save it. Allow it in Settings → Apps → Igris.');
  }

  const { uri, headers } = await drawnSource(lane, name);
  const file = new File(Paths.cache, name);
  try {
    await File.downloadFileAsync(uri, file, { headers, idempotent: true });
  } catch {
    throw new Error('Could not fetch the picture from the Mac.');
  }

  try {
    const asset = await MediaLibrary.createAssetAsync(file.uri);
    const album = await MediaLibrary.getAlbumAsync(ALBUM);
    if (album) await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    else await MediaLibrary.createAlbumAsync(ALBUM, asset, false);
  } finally {
    try {
      file.delete();
    } catch {
      // the cache is cleared by the OS anyway
    }
  }
}

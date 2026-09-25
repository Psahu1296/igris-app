import * as ImagePicker from 'expo-image-picker';

import type { Photo } from '@/lib/maestro';

/**
 * One photo for Igris to look at: from the camera, or from the gallery (screenshots
 * live there). The system camera and photo picker do the UI; we only ask for the
 * camera permission, which the picker's own manifest declares — the gallery on
 * Android 13+ goes through the system photo picker and needs no permission at all.
 *
 * Quality 0.7 JPEG: a 12 MP photo is still 1–3 MB, well under maestro's 12 MB limit,
 * and gemma4 downsizes every image anyway, so a sharper upload buys nothing but time
 * on the tailnet.
 *
 * Returns null when the user backs out. Throws with a sentence on a refused permission.
 */
export async function pickPhoto(
  source: 'camera' | 'library',
): Promise<Photo | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    base64: true,
    exif: false,
    allowsEditing: false,
  };

  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error(
        'Igris needs the camera permission. Allow it in Settings → Apps → Igris.',
      );
    }
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  const asset = result.canceled ? null : result.assets[0];
  if (!asset?.base64) return null;
  return { base64: asset.base64, uri: asset.uri };
}

import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Check, Download } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, ToastAndroid, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { PhotoViewer } from '@/components/photo-viewer';
import { Meta } from '@/components/typography';
import { Palette, Space } from '@/constants/theme';
import { saveDrawn } from '@/lib/gallery';
import { drawnSource, type Drawn, type Lane } from '@/lib/maestro';

/**
 * A picture Igris drew, loaded from the Mac with the session token. Square, as
 * maestro draws it (imagine.IMAGE_SIZE), unless `aspect` (width / height) says otherwise. A failed load says so instead of leaving a
 * blank box — most often a conversation reopened on Render, which has no pictures.
 * A tap opens it full screen (PhotoViewer).
 */
export function DrawnPicture({ lane, picture, aspect = 1 }: { lane: Lane; picture: Drawn; aspect?: number }) {
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    drawnSource(lane, picture.name)
      .then((s) => live && setSource(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [lane, picture.name]);

  if (failed) return <Meta style={styles.drawnFailed}>The picture is on the Mac and could not be loaded.</Meta>;
  if (!source) return <View style={[styles.drawn, { aspectRatio: aspect }]} />;
  return (
    <View>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityHint="Opens it full screen">
        <Image
          source={source}
          style={[styles.drawn, { aspectRatio: aspect }]}
          contentFit="cover"
          transition={200}
          accessibilityLabel={picture.prompt || 'A picture Igris drew'}
          onError={() => setFailed(true)}
        />
      </Pressable>
      <PhotoViewer source={open ? source : null} label={picture.prompt} onClose={() => setOpen(false)} />
      <SaveButton lane={lane} name={picture.name} />
      {picture.model ? <Meta style={styles.model}>Drawn with {picture.model}</Meta> : null}
    </View>
  );
}

/** Download a drawn picture into the gallery's "Igris" album (lib/gallery.ts). */
function SaveButton({ lane, name }: { lane: Lane; name: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const save = async () => {
    if (state !== 'idle') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setState('saving');
    try {
      await saveDrawn(lane, name);
      setState('saved');
      ToastAndroid.show('Saved to your gallery, in the Igris album.', ToastAndroid.SHORT);
    } catch (err) {
      setState('idle');
      ToastAndroid.show(err instanceof Error ? err.message : 'Could not save the picture.', ToastAndroid.LONG);
    }
  };

  return (
    <PressableScale
      onPress={() => void save()}
      disabled={state !== 'idle'}
      accessibilityRole="button"
      accessibilityLabel={state === 'saved' ? 'Saved to gallery' : 'Save to gallery'}
      style={styles.saveButton}>
      {state === 'saved' ? (
        <Check size={16} color={Palette.text} />
      ) : (
        <Download size={16} color={Palette.text} style={state === 'saving' ? styles.saving : undefined} />
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  drawnFailed: { color: Palette.muted },
  // Which model drew it: HD pictures come from a different one (maestro imagine.HD).
  model: { color: Palette.faint, marginTop: Space.xs },
  drawn: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: Palette.surfaceLift,
  },
  saveButton: {
    position: 'absolute',
    right: Space.sm,
    bottom: Space.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9, 8, 14, 0.7)',
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
  },
  saving: { opacity: 0.4 },
});

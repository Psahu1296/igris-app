import { Image } from 'expo-image';
import { EyeOff, Lock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DrawnPicture } from '@/components/cards/drawn-picture';
import { PressableScale } from '@/components/pressable-scale';
import { Meta } from '@/components/typography';
import { Palette, Space } from '@/constants/theme';
import { PHOTO_ASPECT, type CompanionPhoto } from '@/lib/companion';
import { drawnSource, type Lane } from '@/lib/maestro';

/**
 * A photo of hers he can open a single time (her `[private: …]` tag). Blurred until he
 * taps it; clear for as long as this screen stays open; shut for good after that, because
 * the Mac remembers it was opened (`opened`).
 */
export function OncePhoto({ lane, photo, opened, onOpen }: { lane: Lane; photo: CompanionPhoto; opened: boolean; onOpen: () => void }) {
  const [showing, setShowing] = useState(false);
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);

  useEffect(() => {
    let live = true;
    drawnSource(lane, photo.name)
      .then((s) => live && setSource(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [lane, photo.name]);

  if (showing) return <DrawnPicture lane={lane} picture={{ name: photo.name, prompt: photo.scene }} aspect={PHOTO_ASPECT} />;
  return (
    <PressableScale
      onPress={() => {
        setShowing(true);
        onOpen();
      }}
      disabled={opened}
      accessibilityRole="button"
      accessibilityLabel={opened ? 'A private photo, already opened' : 'Open this private photo once'}
      style={styles.box}>
      {source ? <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={70} /> : null}
      <View style={styles.label}>
        {opened ? <EyeOff size={14} color={Palette.text} /> : <Lock size={14} color={Palette.text} />}
        <Meta style={styles.labelText}>{opened ? 'Opened' : 'Tap to open · once'}</Meta>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  box: { aspectRatio: PHOTO_ASPECT, backgroundColor: Palette.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(9, 8, 14, 0.7)',
  },
  labelText: { color: Palette.text },
});

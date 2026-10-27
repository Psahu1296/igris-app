import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Check, Heart } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomSheet, sheetStyles } from '@/components/companion/bottom-sheet';
import { PressableScale } from '@/components/pressable-scale';
import { Meta } from '@/components/typography';
import { Font, Palette, Space, Type } from '@/constants/theme';
import type { CompanionListing } from '@/lib/companion';
import { drawnSource, type Lane } from '@/lib/maestro';

/**
 * Who to talk to: every companion on the Mac with her face (maestro companion/profiles.py).
 * Replaced Android's system alert, which looked like no other screen in the app and held
 * only two names and Cancel.
 */
export function SwitchSheet({
  lane,
  current,
  companions,
  accent,
  onPick,
  onClose,
}: {
  lane: Lane;
  current: string | null;
  companions: CompanionListing[];
  accent: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet title="Talk to" onClose={onClose}>
      <ScrollView contentContainerStyle={sheetStyles.list}>
        {companions.map((c) => {
          const here = c.id === current;
          return (
            <PressableScale
              key={c.id}
              disabled={here}
              onPress={() => {
                void Haptics.selectionAsync();
                onClose();
                onPick(c.id);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: here }}
              accessibilityLabel={here ? `${c.name}, talking now` : `Talk to ${c.name}`}
              style={[styles.row, here && { borderColor: accent }]}>
              <Face lane={lane} face={c.face} accent={accent} />
              <View style={styles.text}>
                <Text style={styles.name}>{c.name}</Text>
                <Meta>{here ? 'talking now' : c.busy ? 'replying…' : `${c.age}`}</Meta>
              </View>
              {here ? <Check size={18} color={accent} /> : null}
            </PressableScale>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

/** Her base face, or a heart before her first photo (the header Avatar's look, without its tap). */
function Face({ lane, face, accent }: { lane: Lane; face: string | null; accent: string }) {
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  useEffect(() => {
    if (!face) return;
    let live = true;
    drawnSource(lane, face)
      .then((s) => live && setSource(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [lane, face]);
  return (
    <View style={styles.face}>
      {face && source ? (
        <Image source={source} style={styles.faceImage} contentFit="cover" />
      ) : (
        <Heart size={18} color={accent} fill={accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.surfaceGlass,
  },
  face: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceGlass,
    overflow: 'hidden',
  },
  faceImage: { width: '100%', height: '100%' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: Font.voiceMedium, color: Palette.text, ...Type.answer },
});

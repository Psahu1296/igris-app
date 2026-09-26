import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Building2, Cross, MapPin, Phone, Pill, Shield } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, ToastAndroid, View } from 'react-native';

import { shared } from '@/components/cards/styles';
import { PressableScale } from '@/components/pressable-scale';
import { Meta } from '@/components/typography';
import { Font, Palette, Space } from '@/constants/theme';
import { dialHelpline, openNearby, shareLocation, SOS_NUMBERS, type Nearby } from '@/lib/emergency';

/**
 * Shown the moment the transcript hears an emergency — before anything goes to
 * maestro. Every button works offline; each call opens the dialer with the number in
 * it, so one tap there places it (lib/emergency.ts says why it is not automatic).
 */
export function SosCard() {
  const [sharing, setSharing] = useState(false);
  const [first, ...rest] = SOS_NUMBERS;

  const call = (number: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    dialHelpline(number);
  };

  const share = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSharing(true);
    try {
      await shareLocation();
    } catch (err) {
      ToastAndroid.show(err instanceof Error ? err.message : 'Could not get your location.', ToastAndroid.LONG);
    } finally {
      setSharing(false);
    }
  };

  const nearby = (kind: Nearby) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openNearby(kind);
  };

  return (
    <View style={[shared.callCard, styles.card]}>
      <PressableScale
        onPress={() => call(first.number)}
        accessibilityRole="button"
        accessibilityLabel={`Call ${first.number}, ${first.service}`}
        style={styles.big}>
        <Phone size={22} color={Palette.ground} />
        <View>
          <Text style={styles.bigNumber}>{first.number}</Text>
          <Text style={styles.bigLabel}>{first.service}</Text>
        </View>
      </PressableScale>

      <View style={styles.row}>
        {rest.map((h) => (
          <PressableScale
            key={h.number}
            onPress={() => call(h.number)}
            accessibilityRole="button"
            accessibilityLabel={`Call ${h.number}, ${h.service}`}
            style={styles.small}>
            <Text style={styles.smallNumber}>{h.number}</Text>
            <Meta style={styles.smallLabel} numberOfLines={1}>
              {h.service.split(' ')[0]}
            </Meta>
          </PressableScale>
        ))}
      </View>

      <PressableScale
        onPress={() => void share()}
        disabled={sharing}
        accessibilityRole="button"
        accessibilityLabel="Send my location in a message"
        style={styles.action}>
        <MapPin size={16} color={Palette.text} />
        <Text style={styles.actionText}>{sharing ? 'Finding you…' : 'Send my location by SMS'}</Text>
      </PressableScale>

      <View style={styles.row}>
        {([
          ['hospital', Cross, 'Hospital'],
          ['pharmacy', Pill, 'Pharmacy'],
          ['police station', Shield, 'Police'],
        ] as const).map(([kind, Icon, label]) => (
          <PressableScale
            key={kind}
            onPress={() => nearby(kind)}
            accessibilityRole="button"
            accessibilityLabel={`Nearest ${kind} on the map`}
            style={styles.nearby}>
            <Icon size={14} color={Palette.text} />
            <Meta style={styles.nearbyText}>{label}</Meta>
          </PressableScale>
        ))}
      </View>

      <PressableScale
        onPress={() => router.push('/helplines')}
        accessibilityRole="button"
        style={styles.more}>
        <Building2 size={13} color={Palette.muted} />
        <Meta style={shared.actionText}>All helplines</Meta>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: Palette.alert + '66', backgroundColor: Palette.alert + '10' },
  big: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: 14,
    backgroundColor: Palette.alert,
  },
  bigNumber: { fontFamily: Font.voiceMedium, color: Palette.ground, fontSize: 26 },
  bigLabel: { fontFamily: Font.ui, color: Palette.ground, fontSize: 12 },
  row: { flexDirection: 'row', gap: Space.sm },
  small: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Space.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.alert + '55',
  },
  smallNumber: { fontFamily: Font.voiceMedium, color: Palette.text, fontSize: 18 },
  smallLabel: { color: Palette.muted, fontSize: 11 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    borderRadius: 12,
    backgroundColor: Palette.surfaceLift,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
  },
  actionText: { fontFamily: Font.uiMedium, color: Palette.text, fontSize: 14 },
  nearby: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Space.sm,
    borderRadius: 10,
    backgroundColor: Palette.surfaceLift,
  },
  nearbyText: { color: Palette.text, fontSize: 12 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
});

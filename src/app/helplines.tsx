import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Cross, LifeBuoy, MapPin, Phone, Pill, Shield, X } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { Answer, Meta, Title } from '@/components/typography';
import { Font, Gutter, Palette, Space } from '@/constants/theme';
import { dialHelpline, HELPLINES, openNearby, shareLocation, type Nearby } from '@/lib/emergency';

/**
 * Helplines and SOS, all on the phone: works offline, with maestro down, and sends
 * nothing anywhere unless you press Send in the messaging app yourself.
 */
export default function Helplines() {
  const [sharing, setSharing] = useState(false);

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

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <LifeBuoy size={20} color={Palette.alert} />
          <Title style={styles.headerTitle}>Helplines & SOS</Title>
        </View>
        <PressableScale
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.close}>
          <X size={18} color={Palette.text} />
        </PressableScale>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Answer style={styles.lede}>
          Say “emergency” or “bachao” to Igris anytime for the SOS card. A tap opens the dialer with the number
          filled in; you press call.
        </Answer>

        <View style={styles.section}>
          <Meta style={styles.sectionTitle}>RIGHT NOW</Meta>
          <PressableScale
            onPress={() => void share()}
            disabled={sharing}
            accessibilityRole="button"
            style={styles.action}>
            <MapPin size={18} color={Palette.text} />
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
                onPress={() => openNearby(kind as Nearby)}
                accessibilityRole="button"
                accessibilityLabel={`Nearest ${kind} on the map`}
                style={styles.nearby}>
                <Icon size={16} color={Palette.text} />
                <Meta style={styles.nearbyText}>{label}</Meta>
              </PressableScale>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Meta style={styles.sectionTitle}>HELPLINES (INDIA)</Meta>
          {HELPLINES.map((h) => (
            <PressableScale
              key={h.number}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                dialHelpline(h.number);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Call ${h.number}, ${h.service}`}
              style={styles.line}>
              <Text style={[styles.number, h.number === '112' && styles.urgent]}>{h.number}</Text>
              <Text style={styles.service}>{h.service}</Text>
              <Phone size={16} color={h.number === '112' ? Palette.alert : Palette.muted} />
            </PressableScale>
          ))}
          <Meta style={styles.footnote}>
            Each number was checked against an official source on 27 Sep 2026. 112 works from any phone, even without
            balance.
          </Meta>
        </View>

        <View style={styles.section}>
          <Meta style={styles.sectionTitle}>SET UP ONCE</Meta>
          <Meta style={styles.footnote}>
            Android’s own Emergency SOS (press power 5 times) and lock-screen emergency information work even when
            the phone is locked. Settings › Safety & emergency.
          </Meta>
          <PressableScale onPress={() => void Linking.openSettings()} accessibilityRole="button" style={styles.link}>
            <Meta style={styles.linkText}>Open Settings</Meta>
          </PressableScale>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
    paddingVertical: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  headerTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  headerTitle: { fontSize: 22 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  content: { padding: Gutter, gap: Space.xl, paddingBottom: Space.huge },
  lede: { color: Palette.muted, fontSize: 15, lineHeight: 22 },
  section: { gap: Space.sm },
  sectionTitle: { fontSize: 10, letterSpacing: 1.2, color: Palette.faint },
  row: { flexDirection: 'row', gap: Space.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    paddingVertical: Space.md,
    borderRadius: 14,
    backgroundColor: Palette.surfaceLift,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
  },
  actionText: { fontFamily: Font.uiMedium, color: Palette.text, fontSize: 15 },
  nearby: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Space.sm + 2,
    borderRadius: 12,
    backgroundColor: Palette.surfaceLift,
  },
  nearbyText: { color: Palette.text, fontSize: 13 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
    borderRadius: 12,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  number: { width: 64, fontFamily: Font.voiceMedium, color: Palette.text, fontSize: 20 },
  urgent: { color: Palette.alert },
  service: { flex: 1, fontFamily: Font.ui, color: Palette.text, fontSize: 14 },
  footnote: { color: Palette.muted, fontSize: 12, lineHeight: 18 },
  link: { alignSelf: 'flex-start' },
  linkText: { color: Palette.text, fontFamily: Font.uiMedium, fontSize: 13 },
});

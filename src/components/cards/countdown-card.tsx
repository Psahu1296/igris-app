import { Phone, X } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { shared } from '@/components/cards/styles';
import { PressableScale } from '@/components/pressable-scale';
import { Meta } from '@/components/typography';
import { Palette } from '@/constants/theme';
import type { Contact } from '@/lib/device';

/**
 * A quick-call favourite, about to ring. The bar drains to the deadline and the call
 * goes out when it empties (useConversation owns the timer; this only draws it). Cancel and
 * "no" both stop it; Call now skips the wait.
 */
export function CountdownCard({
  contact,
  deadline,
  accent,
  onCall,
  onCancel,
}: {
  contact: Contact;
  /** Epoch ms. A past (or 0) deadline draws an empty bar. */
  deadline: number;
  accent: string;
  onCall: (contact: Contact) => void;
  onCancel: () => void;
}) {
  const left = useSharedValue(1);
  useEffect(() => {
    left.value = withTiming(0, {
      duration: Math.max(0, deadline - Date.now()),
      easing: Easing.linear,
    });
  }, [deadline, left]);
  const bar = useAnimatedStyle(() => ({ width: `${left.value * 100}%` }));

  return (
    <View style={[shared.callCard, { borderColor: accent + '44', backgroundColor: accent + '0C' }]}>
      <Meta style={shared.callPrompt}>Calling — say “no” to stop</Meta>
      <View style={shared.callRow}>
        <View style={shared.callWho}>
          <Text style={shared.callName} numberOfLines={1}>
            {contact.name}
          </Text>
          <Meta style={shared.callNumber} numberOfLines={1}>
            {`${contact.label} · ${contact.number}`}
          </Meta>
        </View>
        <PressableScale
          onPress={() => onCall(contact)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Call ${contact.name} now`}
          style={[shared.callButton, { backgroundColor: accent }]}>
          <Phone size={16} color={Palette.ground} />
        </PressableScale>
      </View>
      <View style={styles.countdownTrack}>
        <Animated.View style={[styles.countdownBar, { backgroundColor: accent }, bar]} />
      </View>
      <PressableScale
        onPress={onCancel}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Cancel call"
        style={shared.callCancel}>
        <X size={13} color={Palette.muted} />
        <Meta style={shared.actionText}>Cancel</Meta>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  countdownTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: Palette.hairline,
    overflow: 'hidden',
  },
  countdownBar: {
    height: 3,
  },
});

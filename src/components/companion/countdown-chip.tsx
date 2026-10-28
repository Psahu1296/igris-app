import { Hourglass } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Font, Space, Type } from '@/constants/theme';

/** Minutes left until `eta`, 0 once it has passed. */
const minutesLeft = (eta: string) => Math.max(0, Math.round((new Date(eta).getTime() - Date.now()) / 60000));

/**
 * His visit, counted down in her header (maestro countdown.py, GET /companion `eta`): set when
 * he says he is on his way, gone once he arrives. Re-counted every 20 s; "now" when it is due.
 */
export function CountdownChip({ eta, accent }: { eta: string; accent: string }) {
  const [left, setLeft] = useState(() => minutesLeft(eta));
  // A new `eta` remounts this chip (the parent keys it by eta), so the first count is the initial state.
  useEffect(() => {
    const timer = setInterval(() => setLeft(minutesLeft(eta)), 20000);
    return () => clearInterval(timer);
  }, [eta]);
  const label = left <= 0 ? 'any moment' : left < 60 ? `${left} min` : `${Math.floor(left / 60)}h ${left % 60}m`;
  return (
    <View style={[styles.chip, { borderColor: accent }]} accessibilityLabel={`You arrive in ${label}`}>
      <Hourglass size={11} color={accent} />
      <Text style={[styles.text, { color: accent }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: Space.sm,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: { fontFamily: Font.uiMedium, ...Type.micro },
});

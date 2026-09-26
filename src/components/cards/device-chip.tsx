import { AlarmClock, AlertCircle, Check, MessageSquare, Phone } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { StarToggle } from '@/components/cards/star-toggle';
import { IgrisLoader } from '@/components/igris-loader';
import { Meta } from '@/components/typography';
import { Palette, Space } from '@/constants/theme';
import { describeAction, type DeviceStep } from '@/lib/device';

/**
 * What Igris did on the phone. The spoken answer says what it WILL do; this says
 * what happened — the two differ exactly when the Clock refused, which is the case
 * you need to see.
 */
export function DeviceChip({ step, accent }: { step: DeviceStep; accent: string }) {
  const failed = step.status === 'failed';
  const color = failed ? Palette.alert : step.status === 'cancelled' ? Palette.muted : accent;
  const kind = step.action.kind;
  const Icon = kind === 'call' ? Phone : kind.startsWith('notify') ? MessageSquare : AlarmClock;
  // Once a call is placed the card collapses to the one person actually rung.
  const callee = step.action.kind === 'call' ? step.candidates?.[0] : undefined;
  return (
    <View style={[styles.deviceChip, { borderColor: color + '44', backgroundColor: color + '12' }]}>
      {step.status === 'running' ? (
        <IgrisLoader size={14} tint="auto" state="working" />
      ) : (
        <Icon size={14} color={color} />
      )}
      <Meta style={[styles.deviceText, { color: Palette.text }]} numberOfLines={2}>
        {callee ? `${callee.name} · ${callee.label}` : describeAction(step.action)}
        {step.detail ? <Meta style={{ color }}>{`  ·  ${step.detail}`}</Meta> : null}
      </Meta>
      {step.status === 'done' ? <Check size={14} color={color} /> : null}
      {failed ? <AlertCircle size={14} color={color} /> : null}
      {callee && step.status === 'done' ? <StarToggle contact={callee} accent={accent} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  deviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: 10,
    borderWidth: 1,
  },
  deviceText: {
    flexShrink: 1,
    fontSize: 13,
  },
});

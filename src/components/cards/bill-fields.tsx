import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Receipt } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { shared } from '@/components/cards/styles';
import { PressableScale } from '@/components/pressable-scale';
import { Meta } from '@/components/typography';
import { Font, Palette, Space } from '@/constants/theme';
import type { BillCard } from '@/lib/maestro';

const rupees = (amount: number | null) =>
  amount === null ? '?' : `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * A read bill laid out as Bill-App's Add Expense form asks for it (type, name,
 * amount, date, description), so entering it by hand is copying down four lines.
 * Nothing here is saved; Copy puts the same lines on the clipboard.
 */
export function BillFields({ bill, accent }: { bill: BillCard; accent: string }) {
  const [copied, setCopied] = useState(false);
  const description = bill.items
    .map((i) => (i.quantity !== null ? `${i.name} ${i.quantity}${i.unit ? ' ' + i.unit : ''}` : i.name))
    .join(', ');
  const fields: [string, string][] = [
    ['Type', bill.type],
    ['Name', bill.vendor ?? '—'],
    ['Amount', rupees(bill.total)],
    ['Date', bill.date ?? 'not printed'],
    ['Description', description || '—'],
  ];

  const copy = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(fields.map(([k, v]) => `${k}: ${v}`).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[shared.callCard, { borderColor: accent + '44', backgroundColor: accent + '0C' }]}>
      <View style={shared.chatHead}>
        <Receipt size={13} color={accent} />
        <Text style={shared.chatTitle}>For Bill-App</Text>
        <PressableScale onPress={() => void copy()} accessibilityRole="button" accessibilityLabel="Copy the expense">
          <Meta style={{ color: accent }}>{copied ? 'Copied' : 'Copy'}</Meta>
        </PressableScale>
      </View>
      {fields.map(([label, value]) => (
        <View key={label} style={styles.billRow}>
          <Meta style={styles.billLabel}>{label}</Meta>
          <Text style={styles.billValue} numberOfLines={label === 'Description' ? 3 : 1}>
            {value}
          </Text>
        </View>
      ))}
      {bill.mismatch ? (
        <View style={styles.billRow}>
          <AlertCircle size={13} color={Palette.alert} />
          <Meta style={styles.billWarn}>
            {`The lines add up to ${rupees(bill.items_total)}, not ${rupees(bill.total)}. Check the bill.`}
          </Meta>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  billRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.sm },
  billLabel: { width: 84, color: Palette.muted },
  billValue: { flex: 1, color: Palette.text, fontFamily: Font.ui, fontSize: 14 },
  billWarn: { flex: 1, color: Palette.muted },
});

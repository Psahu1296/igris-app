import { Phone, X } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { StarToggle } from '@/components/cards/star-toggle';
import { shared } from '@/components/cards/styles';
import { PressableScale } from '@/components/pressable-scale';
import { Meta } from '@/components/typography';
import { Palette } from '@/constants/theme';
import type { Contact } from '@/lib/device';

/**
 * "Call who?" — the stop between maestro's proposal and a ringing phone. One row per
 * candidate, best match first, each with its own Call button: with two Rahuls, the
 * choice is yours, not the ranking's.
 */
export function CallCard({
  candidates,
  accent,
  onCall,
  onCancel,
}: {
  candidates: Contact[];
  accent: string;
  onCall: (contact: Contact) => void;
  onCancel: () => void;
}) {
  return (
    <View style={[shared.callCard, { borderColor: accent + '44', backgroundColor: accent + '0C' }]}>
      <Meta style={shared.callPrompt}>
        {candidates.length === 1 ? 'Call? Say “yes”, or tap' : 'Which one?'}
      </Meta>
      {candidates.map((contact) => (
        <View key={`${contact.name}|${contact.number}`} style={shared.callRow}>
          <View style={shared.callWho}>
            <Text style={shared.callName} numberOfLines={1}>
              {contact.name}
            </Text>
            <Meta style={shared.callNumber} numberOfLines={1}>
              {`${contact.label} · ${contact.number}`}
            </Meta>
          </View>
          <StarToggle contact={contact} accent={accent} />
          <PressableScale
            onPress={() => onCall(contact)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Call ${contact.name}, ${contact.label}`}
            style={[shared.callButton, { backgroundColor: accent }]}>
            <Phone size={16} color={Palette.ground} />
          </PressableScale>
        </View>
      ))}
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

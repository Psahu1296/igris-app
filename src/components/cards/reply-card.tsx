import { Send, X } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { shared } from '@/components/cards/styles';
import { PressableScale } from '@/components/pressable-scale';
import { Meta } from '@/components/typography';
import { Font, Palette } from '@/constants/theme';
import type { Conversation } from '@/lib/device';

/**
 * "Send this?" — a dictated reply waits here for a yes, like a call: speech
 * recognition wrote the text, and a message sent to the wrong chat cannot be unsent.
 */
export function ReplyCard({
  text,
  targets,
  accent,
  onSend,
  onCancel,
}: {
  text: string;
  targets: Conversation[];
  accent: string;
  onSend: (target: Conversation, text: string) => void;
  onCancel: () => void;
}) {
  return (
    <View style={[shared.callCard, { borderColor: accent + '44', backgroundColor: accent + '0C' }]}>
      <Meta style={shared.callPrompt}>
        {targets.length === 1 ? 'Send? Say “yes”, or tap' : 'Which chat?'}
      </Meta>
      <Text style={styles.replyText}>{`“${text}”`}</Text>
      {targets.map((target) => (
        <View key={target.key} style={shared.callRow}>
          <View style={shared.callWho}>
            <Text style={shared.callName} numberOfLines={1}>
              {target.title}
            </Text>
            <Meta style={shared.callNumber} numberOfLines={1}>
              {`${target.app} · ${target.lines[target.lines.length - 1]?.text ?? ''}`}
            </Meta>
          </View>
          <PressableScale
            onPress={() => onSend(target, text)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Send to ${target.title} on ${target.app}`}
            style={[shared.callButton, { backgroundColor: accent }]}>
            <Send size={16} color={Palette.ground} />
          </PressableScale>
        </View>
      ))}
      <PressableScale
        onPress={onCancel}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Cancel reply"
        style={shared.callCancel}>
        <X size={13} color={Palette.muted} />
        <Meta style={shared.actionText}>Cancel</Meta>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  replyText: {
    fontFamily: Font.voice,
    color: Palette.text,
    fontSize: 15,
    lineHeight: 21,
  },
});

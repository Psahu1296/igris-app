import { MessageSquare } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { shared } from '@/components/cards/styles';
import { Meta } from '@/components/typography';
import { Palette, Space } from '@/constants/theme';
import type { Conversation } from '@/lib/device';

/** What was read aloud, to glance at instead of listening. Newest chat first. */
export function MessagesCard({ conversations, accent }: { conversations: Conversation[]; accent: string }) {
  return (
    <View style={[shared.callCard, { borderColor: accent + '44', backgroundColor: accent + '0C' }]}>
      {conversations.map((c) => (
        <View key={c.key} style={styles.chat}>
          <View style={shared.chatHead}>
            <MessageSquare size={13} color={accent} />
            <Text style={shared.chatTitle} numberOfLines={1}>
              {c.title}
            </Text>
            <Meta style={shared.callNumber}>{c.app}</Meta>
          </View>
          {c.lines.slice(-3).map((line, i) => (
            <Meta key={i} style={styles.chatLine} numberOfLines={3}>
              {line.sender && line.sender !== c.title ? `${line.sender}: ${line.text}` : line.text}
            </Meta>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chat: {
    gap: 2,
  },
  chatLine: {
    color: Palette.muted,
    fontSize: 13,
    lineHeight: 18,
    paddingLeft: 13 + Space.xs,
  },
});

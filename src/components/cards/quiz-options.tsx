import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Font, Space } from '@/constants/theme';
import type { QuizCard } from '@/lib/maestro';

const LETTERS = 'ABCD';

/**
 * A tutor question's answer buttons. The options themselves are in the answer text
 * (maestro lists them as "A · …"), so the card is just the letters — tapping one
 * sends it as the next message, the same thing saying "B" does. Once answered (a
 * later turn exists) the buttons stay visible but stop responding.
 */
export function QuizOptions({
  card,
  accent,
  onAnswer,
}: {
  card: QuizCard;
  accent: string;
  onAnswer?: (text: string) => void;
}) {
  return (
    <View style={styles.quizRow}>
      {card.options.map((option, i) => (
        <PressableScale
          key={option}
          disabled={!onAnswer}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAnswer?.(LETTERS[i]);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${LETTERS[i]}: ${option}`}
          style={[
            styles.quizLetter,
            { borderColor: accent + '66', backgroundColor: accent + '14' },
            !onAnswer && styles.quizDone,
          ]}>
          <Text style={[styles.quizLetterText, { color: accent }]}>{LETTERS[i]}</Text>
        </PressableScale>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  quizRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.xs },
  quizLetter: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizDone: { opacity: 0.45 },
  quizLetterText: { fontFamily: Font.uiMedium, fontSize: 17 },
});

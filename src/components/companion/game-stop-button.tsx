import * as Haptics from 'expo-haptics';
import { Square } from 'lucide-react-native';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { PressableScale } from '@/components/pressable-scale';
import { Font, Palette, Space, Type } from '@/constants/theme';
import type { CompanionGame } from '@/lib/companion';

/**
 * The floating button while a game or roleplay runs (maestro GET /companion `game`): it says what is
 * being played and stops it with one tap (POST /companion/game/stop, she closes it in one message).
 * Typing "bas" still works; this is so he never has to. Takes the touch button's place.
 */
export function GameStopButton({ game, accent, disabled, onStop }: { game: CompanionGame; accent: string; disabled: boolean; onStop: () => void }) {
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.anchor}>
      <PressableScale
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onStop();
        }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Stop ${game.title}`}
        style={[styles.button, { borderColor: accent }, disabled && styles.dim]}>
        <Square size={14} color={accent} fill={accent} />
        <Text numberOfLines={1} style={styles.text}>
          {game.emoji ? `${game.emoji} ` : ''}Stop {game.kind === 'roleplay' ? 'roleplay' : 'game'}
        </Text>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', right: Space.lg, bottom: Space.lg },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    height: 44,
    paddingHorizontal: Space.lg,
    borderRadius: 22,
    borderWidth: 1.5,
    backgroundColor: Palette.ground,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  text: { fontFamily: Font.uiMedium, color: Palette.text, ...Type.small },
  dim: { opacity: 0.35 },
});

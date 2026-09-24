/* eslint-disable react-hooks/immutability */
import * as Haptics from 'expo-haptics';
import type { PropsWithChildren } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = PropsWithChildren<
  PressableProps & {
    style?: StyleProp<ViewStyle>;
    activeScale?: number;
    haptic?: Haptics.ImpactFeedbackStyle | false;
  }
>;

export function PressableScale({
  children,
  style,
  activeScale = 0.94,
  haptic = Haptics.ImpactFeedbackStyle.Light,
  onPress,
  disabled,
  ...props
}: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (disabled) return;
    scale.value = withSpring(activeScale, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={(e) => {
        if (haptic !== false) {
          void Haptics.impactAsync(haptic);
        }
        onPress?.(e);
      }}
      style={[style, animStyle]}>
      {children}
    </AnimatedPressable>
  );
}

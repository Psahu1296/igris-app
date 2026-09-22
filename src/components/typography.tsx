import { StyleSheet, Text, type TextProps } from 'react-native';

import { Font, Palette, Type } from '@/constants/theme';

/** Igris speaking. Serif, generous leading, the substance of the screen. */
export const Answer = ({ style, ...rest }: TextProps) => (
  <Text {...rest} style={[styles.answer, style]} />
);

/** What you asked. Quiet by design — the question is never the point. */
export const Ask = ({ style, ...rest }: TextProps) => <Text {...rest} style={[styles.ask, style]} />;

/** Where a fact came from, how long it took. Never louder than the answer. */
export const Meta = ({ style, ...rest }: TextProps) => (
  <Text {...rest} style={[styles.meta, style]} />
);

/** Igris narrating its own progress: "Routing to agent…". Transient. */
export const Aside = ({ style, ...rest }: TextProps) => (
  <Text {...rest} style={[styles.aside, style]} />
);

export const Title = ({ style, ...rest }: TextProps) => (
  <Text {...rest} style={[styles.title, style]} />
);

const styles = StyleSheet.create({
  answer: { fontFamily: Font.voice, color: Palette.text, ...Type.answer },
  ask: { fontFamily: Font.ui, color: Palette.muted, ...Type.ask },
  meta: { fontFamily: Font.ui, color: Palette.faint, ...Type.micro },
  aside: { fontFamily: Font.voiceItalic, color: Palette.muted, ...Type.ask },
  title: { fontFamily: Font.voiceMedium, color: Palette.text, ...Type.title },
});

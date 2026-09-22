/**
 * Igris design tokens.
 *
 * The palette encodes system state rather than decorating it. Igris runs on two
 * lanes (PLAN.md decision #4): the Mac over Tailscale, which is instant, free and
 * has every tool; or Render, which is slow, paid and knows less. Warm tungsten
 * means the Mac answered. Cold steel means Render did. You can see which brain
 * you are talking to before you read a word.
 *
 * Ground is a warm-shifted ink, not #000 and not a neutral near-black — Igris is
 * a knight serving a roadside dhaba at night, lit by kerosene, not a spaceship.
 */

import type { Lane } from '@/lib/config';

export const Palette = {
  ground: '#141118',
  surface: '#1E1922',
  surfaceLift: '#272130',
  hairline: '#2E2833',

  text: '#EDE7DC',
  muted: '#8A8178',
  faint: '#5A5450',

  local: '#E8A33D',
  cloud: '#6E8CA8',
  alert: '#C7623F',
} as const;

export type { Lane };

export const laneColor = (lane: Lane) => (lane === 'local' ? Palette.local : Palette.cloud);

/**
 * Two families, clearly distinct, each with one job. Newsreader is Igris's
 * speaking voice; IBM Plex Sans is everything you type and every control. The
 * asymmetry is how you tell who is talking, which is why there are no bubbles.
 * Plex also ships Devanagari, which matters the moment dhaba talk turns Hindi.
 */
export const Font = {
  voice: 'Newsreader_400Regular',
  voiceMedium: 'Newsreader_500Medium',
  voiceItalic: 'Newsreader_400Regular_Italic',
  ui: 'IBMPlexSans_400Regular',
  uiMedium: 'IBMPlexSans_500Medium',
} as const;

/** Modular scale, ~1.25. Serif gets more leading than the sans, as it should. */
export const Type = {
  micro: { fontSize: 11, lineHeight: 15 },
  small: { fontSize: 13, lineHeight: 19 },
  ask: { fontSize: 15, lineHeight: 22 },
  answer: { fontSize: 18, lineHeight: 28 },
  title: { fontSize: 27, lineHeight: 32 },
} as const;

export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const;

/** Reading measure. Below ~80 characters, per Bringhurst; on a phone this is the gutter. */
export const Gutter = 20;

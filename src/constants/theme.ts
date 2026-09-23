/**
 * Igris design tokens.
 *
 * The palette encodes system state rather than decorating it. Igris runs on two
 * lanes (PLAN.md decision #4): the Mac, reached over the tailnet or the LAN, which
 * is free and has every tool; or Render, which is paid and knows less. Warm tungsten
 * means the Mac answered. Cold steel means Render did. You can see which brain you
 * are talking to before you read a word.
 *
 * Note the lane is about *reach*, not speed. Measured from the phone on 2026-09-23 the
 * Mac took 30.1s, because maestro's PERSONA_MODEL is gpt-4.1-nano — a network call to
 * OpenAI, not a local Ollama. The Mac lane is not the fast lane until that changes.
 *
 * Ground is a warm-shifted ink, not #000 and not a neutral near-black — Igris is
 * a knight serving a roadside dhaba at night, lit by kerosene, not a spaceship.
 */

import type { Lane } from '@/lib/config';

export const Palette = {
  ground: '#09080E',
  surface: '#14121E',
  surfaceLift: '#1C182A',
  surfaceGlass: 'rgba(255, 255, 255, 0.04)',
  surfaceGlassHover: 'rgba(255, 255, 255, 0.08)',
  hairline: 'rgba(255, 255, 255, 0.09)',
  hairlineBright: 'rgba(255, 255, 255, 0.16)',

  text: '#F5F2EC',
  muted: '#A29990',
  faint: '#635B54',

  local: '#FFB338',
  localGlow: 'rgba(255, 179, 56, 0.25)',
  localSoft: 'rgba(255, 179, 56, 0.12)',

  cloud: '#38BDF8',
  cloudGlow: 'rgba(56, 189, 248, 0.25)',
  cloudSoft: 'rgba(56, 189, 248, 0.12)',

  thinking: '#A855F7',
  thinkingGlow: 'rgba(168, 85, 247, 0.3)',

  alert: '#FF5555',
  alertGlow: 'rgba(255, 85, 85, 0.25)',
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

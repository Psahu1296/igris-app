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

  // Auto is a MODE, not a brain: the probe is choosing. Emerald because it is the
  // one hue left that none of the others claim — not tungsten (Mac), not steel
  // (Render), not violet (thinking), not red (alert) — and it reads as "live",
  // where a neutral silver would read as disabled on the send button and the orb.
  auto: '#34D399',
  autoGlow: 'rgba(52, 211, 153, 0.25)',
  autoSoft: 'rgba(52, 211, 153, 0.12)',

  thinking: '#A855F7',
  thinkingGlow: 'rgba(168, 85, 247, 0.3)',

  // An agent is running tools (maestro's `agent_started`). Pink because every other
  // hue is spoken for: tungsten, steel, emerald are modes; violet is thinking; red
  // is alert. An orange would have sat too close to tungsten and read as "the Mac".
  working: '#EC4899',
  workingGlow: 'rgba(236, 72, 153, 0.3)',

  alert: '#FF5555',
  alertGlow: 'rgba(255, 85, 85, 0.25)',
} as const;

export type { Lane };

/**
 * What the THEME is coloured by. Not the same as the lane: in Auto the probe picks
 * the brain, and the user asked to see that they are in Auto at a glance. Pinned,
 * the tint and the lane are the same thing. It is exactly `lanePref` from session.
 *
 * Facts about a specific answer — which brain produced this turn, whether the mic
 * can reach Whisper — still read the real lane, never the tint. A Render answer
 * stays steel in the transcript whatever mode you are in.
 */
export type Tint = 'auto' | Lane;

export const laneColor = (tint: Tint) =>
  tint === 'local' ? Palette.local : tint === 'cloud' ? Palette.cloud : Palette.auto;

export const laneGlow = (tint: Tint) =>
  tint === 'local' ? Palette.localGlow : tint === 'cloud' ? Palette.cloudGlow : Palette.autoGlow;

/** A 12% wash of the tint — enough to colour a surface without competing with text. */
export const laneSoft = (tint: Tint) =>
  tint === 'local' ? Palette.localSoft : tint === 'cloud' ? Palette.cloudSoft : Palette.autoSoft;

/**
 * The sigil is metal, and which metal says which brain answered: warm tungsten for
 * the Mac, cold steel for Render. `mid` IS laneColor(lane), so the mark and the lane
 * badge cannot drift apart — change the palette and both follow.
 *
 * The LAUNCHER icon is always tungsten (assets/icon-src/build-icons.mjs). It has to
 * be: the splash starts drawing while status is still 'loading', before any probe has
 * resolved, so at that moment there is no lane to colour it with. Lane tinting
 * therefore begins once the mark appears inside the app, not on the splash.
 */
/**
 * The loader's colour for each step of a turn. Thinking and working have their own
 * metals; answering deliberately has none — it takes the metal of the brain that
 * answered (see IgrisLoader), so the avatar settles into the same colour it was
 * speaking in instead of jumping at the end.
 */
export const phaseMetal = {
  thinking: { hi: '#E4CCFF', mid: Palette.thinking, lo: '#5B1FA6', core: '#F6EDFF' },
  working: { hi: '#FBCFE8', mid: Palette.working, lo: '#9D174D', core: '#FFF0F7' },
} as const;

export const laneMetal = (tint: Tint) =>
  tint === 'local'
    ? { hi: '#FFE0A3', mid: Palette.local, lo: '#A9661A', core: '#FFF3D6' }
    : tint === 'cloud'
      ? { hi: '#BFE6FF', mid: Palette.cloud, lo: '#1A6FA0', core: '#EAF6FF' }
      : { hi: '#BDF4DC', mid: Palette.auto, lo: '#0F7250', core: '#F0FFF8' };

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

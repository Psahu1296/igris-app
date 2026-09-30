import { ToastAndroid } from 'react-native';

import { fetchManifest, type AssetSpec } from '@/lib/assets/manifest';
import { withoutTag } from '@/lib/companion';
import { toDevanagari } from '@/lib/voice/hinglish';
import { modelState } from '@/lib/voice/model';
import { spellOut } from '@/lib/voice/shorthand';
import { hasWomanVoice, speakHindiWoman, stopHindiWoman } from '@/lib/voice/system-tts';
import { getVoice, releaseVoice, stopVoice } from '@/lib/voice/tts';

/**
 * Her messages said aloud: Piper hi_IN-priyamvada, a neural voice (tts.ts, same sherpa
 * engine Alan uses), once downloaded (Menu → Voice); the phone's own flat Hindi voice
 * (system-tts.ts) until then, so a fresh install still speaks, just less naturally.
 * Either way nothing she writes leaves the phone. Needs the native fallback voice of an
 * APK from v1.2.0; on an older build `canSpeak` is false and the chat shows no speaker.
 *
 * Both voices read flatly, so only her words are said. What she does (*smiles*), her
 * photo tags, emoji and the sounds she makes (ahh, mmm) stay on the page: read out
 * letter by letter they are worse than silence.
 */
export const canSpeak = hasWomanVoice;

// The asset spec for her voice, fetched once (manifest.ts's own cache would refetch on
// every call otherwise). null until the fetch resolves or fails; then never re-fetched —
// same lifetime as the module, same pattern as `liveMode` in lib/companion.ts.
let seema: AssetSpec | null = null;
void fetchManifest()
  .then((manifest) => {
    seema = manifest.assets.find((a) => a.id === 'voice-seema') ?? null;
  })
  .catch(() => {
    // The chat works fine without her neural voice; the flat fallback still speaks.
  });

// A sound that is nothing but a sound (ahh, mmmh, uff, ohh, hahaha, huhh, sss, hmm).
const NOISE = /\b(?:[aou]+h+|a{2,}|m{2,}h*|hm{2,}|u+f{2,}|h+a{2,}h*|u+n+g?h{2,}|hu+h+|s{3,}|e{3,}|(?:ha){2,}h?|(?:he){2,}h?)\b[.!?~-]*/gi;

/** What the voice says for one message of hers; '' when there are no words in it. */
export function spoken(text: string): string {
  const words = withoutTag(text)
    .replace(/\*[^*\n]{1,120}\*/g, ' ')
    .replace(/[*_~]/g, ' ')
    .replace(/[\p{Extended_Pictographic}‍️]/gu, ' ')
    .replace(NOISE, ' ')
    // A held word is said as the word: "haaann" → "haan", "pleeease" → "please".
    .replace(/(\w)\1{2,}/g, (_, letter: string) => (letter.toLowerCase() === 'a' ? letter + letter : letter))
    .replace(/\.{2,}|…/g, ', ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/([.!?]),/g, '$1')
    .replace(/^[\s,.!?]+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
  return /[\p{L}]/u.test(words) ? toDevanagari(spellOut(words)) : '';
}

// Said once per app run: the neural voice is worth downloading, but repeating that on
// every message she speaks would be noise, same reasoning as `toldNoVoice` in use-speech.ts.
let warnedFallback = false;

/** Says it, cutting off whatever she was saying. Resolves when finished or stopped. */
export async function say(text: string): Promise<void> {
  const words = spoken(text);
  if (!words) return;
  if (seema && modelState(seema) === 'ready') {
    try {
      const tts = await getVoice(seema);
      await tts.speak(words);
      return;
    } catch {
      // Fall through to the phone's own Hindi voice below.
    }
  } else if (!warnedFallback) {
    warnedFallback = true;
    ToastAndroid.show("Her real voice needs downloading — Menu → Voice.", ToastAndroid.LONG);
  }
  stopHindiWoman();
  await speakHindiWoman(words);
}

/** Stops whichever voice is speaking, without waiting for it. */
export function hush(): void {
  stopHindiWoman();
  if (seema) stopVoice(seema);
}

/** Frees her voice's ~79MB of native memory. Call when leaving the companion screen;
 * `say` reloads it the next time she speaks. */
export async function releaseSeemaVoice(): Promise<void> {
  await releaseVoice(seema);
}

// Whether every reply is said as it arrives. Off on every app start: she should not start
// talking out loud in a room because the phone was unlocked.
let aloud = false;
export const voiceMode = { get: () => aloud, set: (on: boolean) => void (aloud = on) };

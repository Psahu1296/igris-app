import { withoutTag } from "@/lib/companion";
import { toDevanagari } from "@/lib/voice/hinglish";
import { spellOut } from "@/lib/voice/shorthand";
import {
  hasWomanVoice,
  speakHindiWoman,
  stopHindiWoman,
} from "@/lib/voice/system-tts";

/**
 * Her messages said aloud, in the phone's own offline Hindi voice (a woman's): nothing
 * she writes leaves the phone to be spoken. Needs the native voice of an APK from v1.2.0;
 * on an older build `canSpeak` is false and the chat shows no speaker.
 *
 * The voice reads flatly, so only her words are said. What she does (*smiles*), her
 * photo tags, emoji and the sounds she makes (ahh, mmm) stay on the page: read out
 * letter by letter they are worse than silence.
 */
export const canSpeak = hasWomanVoice;

// A sound that is nothing but a sound (ahh, mmmh, uff, ohh, hahaha, huhh, sss, hmm).
const NOISE =
  /\b(?:[aou]+h+|a{2,}|m{2,}h*|hm{2,}|u+f{2,}|h+a{2,}h*|u+n+g?h{2,}|hu+h+|s{3,}|e{3,}|(?:ha){2,}h?|(?:he){2,}h?)\b[.!?~-]*/gi;

/** What the voice says for one message of hers; '' when there are no words in it. */
export function spoken(text: string): string {
  const words = withoutTag(text)
    .replace(/\*[^*\n]{1,120}\*/g, " ")
    .replace(/[*_~]/g, " ")
    .replace(/[\p{Extended_Pictographic}‍️]/gu, " ")
    .replace(NOISE, " ")
    // A held word is said as the word: "haaann" → "haan", "pleeease" → "please".
    .replace(/(\w)\1{2,}/g, (_, letter: string) =>
      letter.toLowerCase() === "a" ? letter + letter : letter,
    )
    .replace(/\.{2,}|…/g, ", ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/([.!?]),/g, "$1")
    .replace(/^[\s,.!?]+/gm, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  return /[\p{L}]/u.test(words) ? toDevanagari(spellOut(words)) : "";
}

/** Says it, cutting off whatever she was saying. Resolves when finished or stopped. */
export async function say(text: string): Promise<void> {
  stopHindiWoman();
  const words = spoken(text);
  if (words) await speakHindiWoman(words);
}

export const hush = stopHindiWoman;

// Whether every reply is said as it arrives. Off on every app start: she should not start
// talking out loud in a room because the phone was unlocked.
let aloud = false;
export const voiceMode = {
  get: () => aloud,
  set: (on: boolean) => void (aloud = on),
};

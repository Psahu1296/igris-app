/**
 * Which voice should say each sentence: Alan (Piper en_GB) or the phone's Hindi voice.
 *
 * Alan's phonemizer is English-only: Devanagari comes out as silence, and romanized
 * Hindi ("kal aa jana bhai") is read with English letter sounds. So a sentence in
 * Hindi or Hinglish goes to the Hindi voice and everything else stays with Alan.
 *
 * Per paragraph, not per sentence or word. A chat read from the shade is one
 * paragraph (notifications.ts speakable): judged line by line, its short lines —
 * "ok", "haan", a name — flipped back to Alan, and one conversation came out in two
 * alternating voices (2026-09-24). A whole paragraph has enough words to judge, and
 * Hinglish carries English words anyway ("meeting cancel ho gayi") that the Hindi
 * voice says fine.
 */

import { AMBIGUOUS, DEVANAGARI } from '@/lib/voice/hinglish';

export type Lang = 'en' | 'hi';
export type Segment = { lang: Lang; text: string };

const SCRIPT = /[\u0900-\u097F]/;

/** Evidence a sentence is Hindi: every known Hindi word except those English shares. */
const HINDI_WORDS = new Set(Object.keys(DEVANAGARI).filter((w) => !AMBIGUOUS.has(w)));

export function languageOf(paragraph: string): Lang {
  if (SCRIPT.test(paragraph)) return 'hi';
  const words = paragraph.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length === 0) return 'en';
  const hits = words.filter((w) => HINDI_WORDS.has(w)).length;
  // One marker in a long English paragraph is a name or a loanword ("bhai" in a
  // contact name); a short reply like "theek hai" is Hindi throughout.
  if (words.length <= 2) return hits >= 1 ? 'hi' : 'en';
  return hits >= 2 && hits / words.length >= 0.2 ? 'hi' : 'en';
}

/** Paragraphs, tagged, with neighbours in the same language merged into one utterance. */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  for (const paragraph of text.split(/\n+/)) {
    if (!paragraph.trim()) continue;
    const lang = languageOf(paragraph);
    const last = out[out.length - 1];
    if (last?.lang === lang) last.text += `\n${paragraph}`;
    else out.push({ lang, text: paragraph });
  }
  return out.map((s) => ({ ...s, text: s.text.trim() }));
}

import { createStreamingTTS, type StreamingTtsEngine } from 'react-native-sherpa-onnx/tts';

import type { AssetSpec } from '@/lib/assets/manifest';
import { toDevanagari } from '@/lib/voice/hinglish';
import { segments } from '@/lib/voice/language';
import { modelPath, modelState } from '@/lib/voice/model';
import { toSpeech } from '@/lib/markdown';
import { spellOut } from '@/lib/voice/shorthand';
import { speakHindi, stopHindi } from '@/lib/voice/system-tts';

/**
 * Text-to-speech, behind an interface.
 *
 * This mirrors maestro/voice/factory.py deliberately: callers depend on the `Tts`
 * interface and the accessors here, never on a concrete engine. Naming a concrete
 * engine anywhere else welds that provider in and breaks the swap — the same rule
 * the Python voice layer states in its README. `SherpaTts` is the one place that
 * touches `react-native-sherpa-onnx`; a second voice (Hindi, the companion's) is
 * another instance of it, not a new class.
 */

export interface Tts {
  readonly provider: string;
  /** Speak, resolving when playback finishes. Interrupts whatever was speaking. */
  speak(text: string): Promise<void>;
  stop(): Promise<void>;
}

export type SpeechStatus =
  | { ready: true }
  | { ready: false; reason: string; fixable: 'download' | 'extract' | 'none' };

export function speechStatus(voice: AssetSpec | undefined): SpeechStatus {
  if (!voice) {
    return { ready: false, reason: 'No voice is listed in the asset manifest.', fixable: 'none' };
  }
  switch (modelState(voice)) {
    case 'ready':
      return { ready: true };
    case 'archived':
      return { ready: false, reason: 'The voice is downloaded but not unpacked yet.', fixable: 'extract' };
    default:
      return { ready: false, reason: 'Download the Igris voice to hear answers.', fixable: 'download' };
  }
}

/**
 * Streaming rather than one-shot synthesis: `createStreamingTTS` carries its own
 * PCM player, so audio starts as soon as the first chunk exists instead of after
 * the whole sentence is rendered. On a long answer that is the difference between
 * an assistant and a progress bar — JARVIS_GAPS #7.
 */
class SherpaTts implements Tts {
  private speaking = false;

  constructor(
    readonly provider: string,
    private readonly engine: StreamingTtsEngine,
    private readonly sampleRate: number
  ) {}

  async speak(text: string): Promise<void> {
    await this.stop();
    this.speaking = true;

    await this.engine.startPcmPlayer(this.sampleRate, 1);
    try {
      await new Promise<void>((resolve, reject) => {
        void this.engine
          .generateSpeechStream(text, undefined, {
            onChunk: (chunk) => {
              void this.engine.writePcmChunk(chunk.samples);
            },
            onEnd: () => resolve(),
            onError: (event) => reject(new Error(event.message)),
          })
          .catch(reject);
      });
    } finally {
      this.speaking = false;
      await this.engine.stopPcmPlayer();
    }
  }

  async stop(): Promise<void> {
    if (!this.speaking) return;
    this.speaking = false;
    await this.engine.cancelSpeechStream();
    await this.engine.stopPcmPlayer();
  }

  destroy() {
    return this.engine.destroy();
  }
}

// One sherpa engine per voice (keyed by asset id, not just "the" voice): Igris's English
// and Hindi voices and the companion's voice can all be loaded at once, since each is a
// separate persona/screen. Creating one loads ~79MB into native memory, so each is built
// once and reused, not per utterance — releaseVoice drops it when a screen no longer needs it.
const cache = new Map<string, { path: string; tts: SherpaTts }>();

async function load(spec: AssetSpec): Promise<SherpaTts> {
  const path = modelPath(spec);
  const existing = cache.get(spec.id);
  if (existing?.path === path) return existing.tts;
  if (existing) {
    await existing.tts.stop().catch(() => {});
    await existing.tts.destroy().catch(() => {});
  }
  const engine = await createStreamingTTS({ modelPath: { type: 'file', path }, modelType: 'vits' });
  const sampleRate = await engine.getSampleRate();
  const tts = new SherpaTts(`sherpa-onnx · piper ${spec.id}`, engine, sampleRate);
  cache.set(spec.id, { path, tts });
  return tts;
}

/** One voice on its own, no language mixing — the companion's, whose whole chat (mostly
 * Hinglish) is read in a single voice rather than split like Igris's English/Hindi mix. */
export async function getVoice(spec: AssetSpec): Promise<Tts> {
  return load(spec);
}

/** Stops it without waiting — for a synchronous cleanup (a screen's unmount, a toggle). */
export function stopVoice(spec: AssetSpec): void {
  cache.get(spec.id)?.tts.stop().catch(() => {});
}

export async function releaseVoice(spec: AssetSpec | null | undefined): Promise<void> {
  if (!spec) return;
  const existing = cache.get(spec.id);
  if (!existing) return;
  cache.delete(spec.id);
  await existing.tts.stop().catch(() => {});
  await existing.tts.destroy().catch(() => {});
}

/**
 * Alan for English; for Hindi and Hinglish (language.ts decides), a neural Piper Hindi
 * voice when `hindiVoice` was given and is downloaded, else the phone's own flat Hindi
 * voice (system-tts.ts) — so a fresh install still speaks Hindi, just less naturally,
 * instead of going silent on half of every mixed sentence. One utterance can switch
 * voices at sentence boundaries — audible, but a mispronounced Hindi sentence is worse
 * than a change of voice.
 */
class MixedTts implements Tts {
  readonly provider: string;
  // Bumped by every stop() and speak(): a sentence loop that sees a newer generation
  // stops, so interrupting a mixed utterance does not let its next sentence start.
  private generation = 0;

  constructor(
    private readonly english: SherpaTts,
    private readonly hindi: SherpaTts | null
  ) {
    this.provider = `${english.provider}${hindi ? ` + ${hindi.provider}` : ' + system hi-IN'}`;
  }

  async speak(text: string): Promise<void> {
    await this.stop();
    const mine = ++this.generation;
    // Markdown to words first (a table read row by row, no asterisks said aloud), then
    // shorthand spelled out ("mtlb" → "matlab"), so the language split sees real words.
    for (const segment of segments(spellOut(toSpeech(text)))) {
      if (this.generation !== mine) return;
      if (segment.lang === 'hi') {
        if (this.hindi) {
          await this.hindi.speak(toDevanagari(segment.text));
          continue;
        }
        try {
          await speakHindi(toDevanagari(segment.text));
          continue;
        } catch {
          if (this.generation !== mine) return;
        }
      }
      await this.english.speak(segment.text);
    }
  }

  async stop(): Promise<void> {
    this.generation++;
    await Promise.all([this.english.stop(), this.hindi?.stop() ?? Promise.resolve(), stopHindi().catch(() => {})]);
  }
}

/** `hindi`: the Hindi voice to prefer, when given and downloaded; otherwise the phone's
 * own Hindi voice speaks those sentences (unchanged from before v6). */
export async function getSpeaker(voice: AssetSpec, hindi?: AssetSpec | null): Promise<Tts> {
  const english = await load(voice);
  let hindiEngine: SherpaTts | null = null;
  if (hindi && modelState(hindi) === 'ready') {
    try {
      hindiEngine = await load(hindi);
    } catch {
      hindiEngine = null;
    }
  }
  return new MixedTts(english, hindiEngine);
}

/** Releases whichever of `voices` are actually loaded. Stray `null`/`undefined` (a
 * voice not yet known, or none configured) are ignored, so a caller can always pass
 * every spec it knows about without checking each one first. */
export async function releaseSpeaker(...voices: (AssetSpec | null | undefined)[]): Promise<void> {
  await Promise.all(voices.map((spec) => releaseVoice(spec)));
}

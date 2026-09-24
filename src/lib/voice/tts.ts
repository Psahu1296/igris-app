import { createStreamingTTS, type StreamingTtsEngine } from 'react-native-sherpa-onnx/tts';

import type { AssetSpec } from '@/lib/assets/manifest';
import { toDevanagari } from '@/lib/voice/hinglish';
import { segments } from '@/lib/voice/language';
import { modelPath, modelState } from '@/lib/voice/model';
import { spellOut } from '@/lib/voice/shorthand';
import { speakHindi, stopHindi } from '@/lib/voice/system-tts';

/**
 * Text-to-speech, behind an interface.
 *
 * This mirrors maestro/voice/factory.py deliberately: callers depend on the `Tts`
 * interface and the accessors here, never on a concrete engine. Naming a concrete
 * engine anywhere else welds that provider in and breaks the swap — the same rule
 * the Python voice layer states in its README.
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
  readonly provider = 'sherpa-onnx · piper en_GB-alan';
  private speaking = false;

  constructor(
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

/**
 * Alan for English, the phone's Hindi voice for Hindi and Hinglish sentences
 * (language.ts decides). One utterance can switch voices at sentence boundaries —
 * audible, but a mispronounced Hindi sentence is worse than a change of voice.
 *
 * Offline-only by construction: the Hindi voice must be a "-local" one, so a message
 * read aloud from the notification shade never goes to Google's servers. Without
 * one, Alan says the sentence as best he can.
 */
class MixedTts implements Tts {
  readonly provider = 'piper en_GB-alan + system hi-IN';
  // Bumped by every stop() and speak(): a sentence loop that sees a newer generation
  // stops, so interrupting a mixed utterance does not let its next sentence start.
  private generation = 0;

  constructor(private readonly english: SherpaTts) {}

  async speak(text: string): Promise<void> {
    await this.stop();
    const mine = ++this.generation;
    // Spelled out first ("mtlb" → "matlab"), so the language split sees real words.
    for (const segment of segments(spellOut(text))) {
      if (this.generation !== mine) return;
      if (segment.lang === 'hi') {
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
    await Promise.all([this.english.stop(), stopHindi().catch(() => {})]);
  }

  destroy() {
    return this.english.destroy();
  }
}

// One engine per model directory. Creating a sherpa engine loads ~79MB of model
// into native memory, so it is built once and reused, not per utterance.
let cached: { path: string; tts: MixedTts } | null = null;

export async function getSpeaker(voice: AssetSpec): Promise<Tts> {
  const path = modelPath(voice);
  if (cached?.path === path) return cached.tts;

  await releaseSpeaker();

  const engine = await createStreamingTTS({
    modelPath: { type: 'file', path },
    modelType: 'vits', // Piper voices are VITS
  });
  const sampleRate = await engine.getSampleRate();

  cached = { path, tts: new MixedTts(new SherpaTts(engine, sampleRate)) };
  return cached.tts;
}

export async function releaseSpeaker(): Promise<void> {
  if (!cached) return;
  const { tts } = cached;
  cached = null;
  await tts.stop().catch(() => {});
  await tts.destroy().catch(() => {});
}

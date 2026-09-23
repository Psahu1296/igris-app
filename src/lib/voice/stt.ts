import { createPcmLiveStream } from 'react-native-sherpa-onnx/audio';

import type { Lane } from '@/lib/config';
import { transcribe } from '@/lib/maestro';
import { encodeWav, rms } from '@/lib/voice/wav';

/**
 * Speech-to-text, done on the Mac.
 *
 * **The phone does not recognise speech, deliberately.** An on-device streaming
 * zipformer was tried first and heard "how is the weather in my city right now" as
 * "ular in my city". That is not a bug to fix: it is a 20M-parameter int8 model on a
 * phone CPU, against the multi-billion-parameter server models that set the
 * expectation. Rather than ship 100–300MB of model for a worse result, the phone
 * records and the Mac's Whisper transcribes — the same engine and the same domain
 * prompt the desk voice loop already uses, so "Igris" and "dhaba" stay words.
 *
 * What the phone still owns is knowing when you stopped talking. That was the only
 * job the on-device model was doing that mattered, and RMS over the captured chunks
 * does it without a model at all.
 */

export interface Listener {
  readonly provider: string;
  start(handlers: ListenHandlers): Promise<void>;
  stop(): Promise<void>;
}

export type ListenHandlers = {
  /** Fires when capture ends and upload begins — there are no live partials. */
  onTranscribing?: () => void;
  /** Fires once with the transcript. Empty means nothing was said. */
  onFinal: (text: string) => void;
  onError?: (error: Error) => void;
};

/** Loud enough to be speech rather than room tone. Tuned on a OnePlus 11R. */
const SPEECH_RMS = 0.015;
/** Silence after speech that ends the utterance. Matches sherpa's old rule1. */
const TRAILING_SILENCE_MS = 1500;
/** Give up waiting for a first word rather than upload a recording of a room. */
const NO_SPEECH_TIMEOUT_MS = 6000;
/** Hard cap, so a pocket-dial cannot upload forever. */
const MAX_UTTERANCE_MS = 30_000;

class RemoteListener implements Listener {
  readonly provider = 'maestro /stt · whisper on the Mac';
  private mic: ReturnType<typeof createPcmLiveStream> | null = null;
  private unsubscribes: (() => void)[] = [];
  private chunks: Float32Array[] = [];
  private sampleRate = 16_000;
  private settled = false;
  private heardSpeech = false;
  private lastVoiceAt = 0;
  private startedAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly lane: Lane) {}

  async start(handlers: ListenHandlers): Promise<void> {
    await this.stop();
    this.chunks = [];
    this.settled = false;
    this.heardSpeech = false;
    this.startedAt = Date.now();
    this.lastVoiceAt = 0;

    const mic = createPcmLiveStream({ sampleRate: 16_000, channelCount: 1 });
    this.mic = mic;

    this.unsubscribes.push(
      mic.onData((samples, sampleRate) => {
        if (this.settled) return;
        this.sampleRate = sampleRate;
        // Copy: the native side may reuse its buffer for the next chunk, and we are
        // keeping these until the end of the utterance.
        this.chunks.push(new Float32Array(samples));
        if (rms(samples) >= SPEECH_RMS) {
          this.heardSpeech = true;
          this.lastVoiceAt = Date.now();
        }
      })
    );

    this.unsubscribes.push(
      mic.onError((message) => this.finish(handlers, new Error(message)))
    );

    // Endpointing lives on a timer rather than in onData, so a speaker who goes
    // completely silent — no chunks at all — is still cut off on schedule.
    this.timer = setInterval(() => {
      if (this.settled) return;
      const now = Date.now();
      const elapsed = now - this.startedAt;

      if (this.heardSpeech && now - this.lastVoiceAt >= TRAILING_SILENCE_MS) {
        void this.finish(handlers);
      } else if (!this.heardSpeech && elapsed >= NO_SPEECH_TIMEOUT_MS) {
        void this.finish(handlers);
      } else if (elapsed >= MAX_UTTERANCE_MS) {
        void this.finish(handlers);
      }
    }, 250);

    await mic.start();
  }

  private async finish(handlers: ListenHandlers, error?: Error): Promise<void> {
    if (this.settled) return;
    this.settled = true;

    const chunks = this.chunks;
    const heardSpeech = this.heardSpeech;
    const sampleRate = this.sampleRate;
    this.chunks = [];
    await this.stop();

    if (error) {
      handlers.onError?.(error);
      handlers.onFinal('');
      return;
    }
    // Nothing above room tone: uploading would cost a round trip to be told so.
    if (!heardSpeech) {
      handlers.onFinal('');
      return;
    }

    handlers.onTranscribing?.();
    try {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const joined = new Float32Array(total);
      let at = 0;
      for (const c of chunks) {
        joined.set(c, at);
        at += c.length;
      }
      handlers.onFinal(await transcribe(this.lane, encodeWav(joined, sampleRate)));
    } catch (err) {
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      handlers.onFinal('');
    }
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    for (const off of this.unsubscribes.splice(0)) off();
    const mic = this.mic;
    this.mic = null;
    if (mic) await mic.stop().catch(() => {});
  }
}

export function getListener(lane: Lane): Listener {
  return new RemoteListener(lane);
}

import { createPcmLiveStream } from 'react-native-sherpa-onnx/audio';
import {
  createStreamingSTT,
  type StreamingSttEngine,
  type SttStream,
} from 'react-native-sherpa-onnx/stt';

import type { AssetSpec } from '@/lib/assets/manifest';
import { modelPath, modelState } from '@/lib/voice/model';

/**
 * Speech-to-text, behind an interface, mirroring tts.ts and maestro/voice/stt.py.
 *
 * **There is no VAD here, and that is deliberate.** The plan called for
 * silero VAD -> STT, copying maestro/voice/vad.py. That cannot be built on this
 * library: `react-native-sherpa-onnx/vad` is a documented placeholder whose every
 * function throws "Not yet implemented". What we actually needed VAD *for* — knowing
 * when the speaker stopped — is built into the streaming recogniser as endpoint
 * detection, so the pipeline is mic -> streaming STT -> endpoint, one stage shorter.
 *
 * Note the model must be an ONLINE type (transducer, paraformer, zipformer2_ctc,
 * nemo_ctc, tone_ctc). Whisper is offline-only and cannot stream, so it is not an
 * option no matter how familiar it is from the Python side.
 */

export interface Listener {
  readonly provider: string;
  /** Begin capturing. Resolves once the mic is live, not when speech ends. */
  start(handlers: ListenHandlers): Promise<void>;
  /** Stop capturing and finalise. Safe to call when not listening. */
  stop(): Promise<void>;
}

export type ListenHandlers = {
  /** Fires repeatedly as the transcript grows. Use for live captions. */
  onPartial?: (text: string) => void;
  /** Fires once, with the settled transcript. Empty string means nothing was said. */
  onFinal: (text: string) => void;
  onError?: (error: Error) => void;
};

export type ListeningStatus =
  | { ready: true }
  | { ready: false; reason: string; fixable: 'download' | 'extract' | 'none' };

export function listeningStatus(ears: AssetSpec | undefined): ListeningStatus {
  if (!ears) {
    return { ready: false, reason: 'No speech model is listed in the asset manifest.', fixable: 'none' };
  }
  switch (modelState(ears)) {
    case 'ready':
      return { ready: true };
    case 'archived':
      return { ready: false, reason: 'The speech model is downloaded but not unpacked yet.', fixable: 'extract' };
    default:
      return { ready: false, reason: 'Download the speech model to talk to Igris.', fixable: 'download' };
  }
}

class SherpaListener implements Listener {
  readonly provider = 'sherpa-onnx · streaming zipformer';
  private stream: SttStream | null = null;
  private mic: ReturnType<typeof createPcmLiveStream> | null = null;
  private unsubscribes: (() => void)[] = [];
  private settled = false;
  private latest = '';

  constructor(private readonly engine: StreamingSttEngine) {}

  async start(handlers: ListenHandlers): Promise<void> {
    await this.stop();
    this.settled = false;
    this.latest = '';

    const stream = await this.engine.createStream();
    this.stream = stream;

    // 16 kHz because that is what every sherpa ASR model expects; the native side
    // resamples for us, so we never have to touch the device's real capture rate.
    const mic = createPcmLiveStream({ sampleRate: 16_000, channelCount: 1 });
    this.mic = mic;

    const finish = (text: string) => {
      if (this.settled) return;
      this.settled = true;
      handlers.onFinal(text);
      void this.stop();
    };

    this.unsubscribes.push(
      mic.onData((samples, sampleRate) => {
        if (this.settled || this.stream !== stream) return;
        // processAudioChunk is feed + decode + read in one bridge call. Doing it by
        // hand costs five crossings per chunk, and chunks arrive many times a second.
        void stream
          .processAudioChunk(samples, sampleRate)
          .then(({ result, isEndpoint }) => {
            if (this.settled || this.stream !== stream) return;
            if (result.text && result.text !== this.latest) {
              this.latest = result.text;
              handlers.onPartial?.(result.text);
            }
            // The recogniser decides the utterance ended — this is what replaces VAD.
            if (isEndpoint) finish(this.latest);
          })
          .catch((err: unknown) => {
            handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
            finish(this.latest);
          });
      })
    );

    this.unsubscribes.push(
      mic.onError((message) => {
        handlers.onError?.(new Error(message));
        finish(this.latest);
      })
    );

    await mic.start();
  }

  /**
   * Releasing in order matters: stop the microphone first so no further chunks are
   * handed to a stream we are about to free, then release the stream. The reverse
   * order hands audio to a dead native pointer.
   */
  async stop(): Promise<void> {
    for (const off of this.unsubscribes.splice(0)) off();

    const mic = this.mic;
    this.mic = null;
    if (mic) await mic.stop().catch(() => {});

    const stream = this.stream;
    this.stream = null;
    if (stream) {
      await stream.inputFinished().catch(() => {});
      await stream.release().catch(() => {});
    }
  }

  destroy() {
    return this.engine.destroy();
  }
}

// One recogniser per model directory, for the same reason as the speaker: creating
// it loads the model into native memory, which is far too expensive per utterance.
let cached: { path: string; listener: SherpaListener } | null = null;

export async function getListener(ears: AssetSpec): Promise<Listener> {
  const path = modelPath(ears);
  if (cached?.path === path) return cached.listener;

  await releaseListener();

  const engine = await createStreamingSTT({
    modelPath: { type: 'file', path },
    // 'auto' runs the same native detection as detectSttModel and maps it to an
    // online type, so swapping the model in the manifest needs no code change.
    modelType: 'auto',
    enableEndpoint: true,
  });

  cached = { path, listener: new SherpaListener(engine) };
  return cached.listener;
}

export async function releaseListener(): Promise<void> {
  if (!cached) return;
  const { listener } = cached;
  cached = null;
  await listener.stop().catch(() => {});
  await listener.destroy().catch(() => {});
}

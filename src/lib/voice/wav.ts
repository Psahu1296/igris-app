/**
 * Float PCM → a WAV file, in memory.
 *
 * maestro's /stt hands the bytes to faster-whisper, which reads a file from disk, so
 * it needs a real container rather than bare samples. WAV is the one format that needs
 * no encoder: a 44-byte header followed by the samples.
 */

const HEADER_BYTES = 44;

/** 16-bit signed PCM is what every ASR front end expects, and halves the upload. */
function toInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling: a sample slightly outside [-1, 1] would otherwise wrap
    // around to the opposite extreme and land in the audio as a click.
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const pcm = toInt16(samples);
  const buffer = new ArrayBuffer(HEADER_BYTES + pcm.byteLength);
  const view = new DataView(buffer);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  const channels = 1;
  const bytesPerSample = 2;

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true); // everything after this field
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk length
  view.setUint16(20, 1, true); // 1 = uncompressed PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true); // byte rate
  view.setUint16(32, channels * bytesPerSample, true); // block align
  view.setUint16(34, bytesPerSample * 8, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.byteLength, true);

  new Uint8Array(buffer, HEADER_BYTES).set(new Uint8Array(pcm.buffer));
  return new Uint8Array(buffer);
}

/** Root mean square of a chunk — loudness, used to tell speech from room tone. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

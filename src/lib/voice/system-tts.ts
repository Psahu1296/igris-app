import IgrisDevice from '../../../modules/igris-device';

/**
 * The phone's offline Hindi voice (Google TTS), for the Hindi and Hinglish sentences
 * Alan cannot say (language.ts). Native side: modules/igris-device HindiVoice.kt —
 * see there for why this is not expo-speech.
 */

/** Resolves when the sentence finishes or is stopped; rejects if it cannot be said. */
export async function speakHindi(text: string): Promise<void> {
  if (!IgrisDevice) throw new Error('This build has no device module.');
  await IgrisDevice.speakHindi(text);
}

export async function stopHindi(): Promise<void> {
  IgrisDevice?.stopHindi();
}

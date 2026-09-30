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

/** Whether this build has the woman's voice (an APK from v1.2.0 on). */
export const hasWomanVoice = () => typeof IgrisDevice?.speakHindiWoman === 'function';

/** The same engine in a woman's voice; resolves when finished or stopped. */
export async function speakHindiWoman(text: string): Promise<void> {
  if (!IgrisDevice?.speakHindiWoman) throw new Error('This build has no woman\'s voice. Update the app.');
  await IgrisDevice.speakHindiWoman(text);
}

export function stopHindiWoman(): void {
  IgrisDevice?.stopHindiWoman?.();
}

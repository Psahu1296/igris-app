import * as Location from 'expo-location';
import { Linking } from 'react-native';

import IgrisDevice from '../../modules/igris-device';

/**
 * Emergencies are handled on the phone, never on a model or a server: "emergency" or
 * "bachao" must work with the Mac asleep and Render cold (~34s), so the transcript
 * recognises it before anything is sent (lib/conversation/use-conversation.ts).
 *
 * The numbers are the same fixed table maestro keeps (maestro/tools/emergency.py),
 * each checked against an official source on 2026-09-27. Change both together.
 */
export type Helpline = { number: string; service: string; source: string };

export const HELPLINES: Helpline[] = [
  { number: '112', service: 'Emergency — police, fire, ambulance', source: 'https://ncw.gov.in/' },
  { number: '108', service: 'Emergency ambulance / disaster', source: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=1719318' },
  { number: '102', service: 'Ambulance (National Ambulance Service)', source: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=1719318' },
  { number: '100', service: 'Police', source: 'https://www.india.gov.in/directory/helpline' },
  { number: '101', service: 'Fire', source: 'https://www.india.gov.in/directory/helpline' },
  { number: '181', service: 'Women helpline', source: 'https://ncw.gov.in/' },
  { number: '1098', service: 'Child helpline (24x7)', source: 'https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=1942873' },
  { number: '14416', service: 'Tele-MANAS mental health (24x7)', source: 'https://telemanas.mohfw.gov.in/home' },
  { number: '14567', service: 'Elderline (senior citizens)', source: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=1719318' },
  { number: '1930', service: 'Cyber crime / online fraud', source: 'https://cybercrime.gov.in/' },
  { number: '1915', service: 'National Consumer Helpline', source: 'https://consumerhelpline.gov.in/' },
  { number: '139', service: 'Railway help (Rail Madad)', source: 'https://railmadad.indianrailways.gov.in/' },
];

/** The four on the SOS card, largest first. */
export const SOS_NUMBERS = ['112', '108', '100', '181'].map((n) => HELPLINES.find((h) => h.number === n)!);

// Same rule as maestro's is_emergency: strong words anywhere, or a bare cry for help.
// "help me with my homework" is not one — "help" alone must be (nearly) the message.
const STRONG =
  /\b(emergency|sos|bachao|bachaao|ambulance|heart attack|chest pain|can'?t breathe|cannot breathe|not breathing|unconscious|behosh|accident|someone is following me|i'?m in danger|in danger|call (?:the )?police|there'?s a fire|house is on fire|on fire)\b/i;
const BARE_HELP = /^\s*(?:help|help me|help help|please help|madad|madad karo|save me)\s*[!.]*\s*$/i;

export const isEmergency = (text: string) => STRONG.test(text) || BARE_HELP.test(text);

/**
 * Opens the dialer with the number in it; the person presses call. Android does not let
 * an app place a call to an emergency number itself — it hands such calls to the dialer
 * anyway — and one tap there cannot be triggered by a misheard word.
 */
export function dialHelpline(number: string) {
  if (IgrisDevice) IgrisDevice.dial(number);
  else void Linking.openURL(`tel:${number}`);
}

export type Nearby = 'hospital' | 'pharmacy' | 'police station';

/** Google Maps' own "near me" search: it knows where the phone is and needs no key. */
export function openNearby(kind: Nearby) {
  void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${kind} near me`)}`);
}

/**
 * Where I am, as a message to send: opens the messaging app with a Maps link filled
 * in, and the person chooses who gets it and presses Send. Nothing is sent by Igris,
 * and the location goes nowhere else.
 */
export async function shareLocation(): Promise<void> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission is off, so there is no position to share.');
  // A fix from the last few minutes beats waiting for a fresh one in an emergency.
  const recent = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000, requiredAccuracy: 200 });
  const here = recent ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  const { latitude, longitude } = here.coords;
  const link = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  const body = `I need help. This is where I am: ${link}`;
  await Linking.openURL(`sms:?body=${encodeURIComponent(body)}`);
}

import { requireOptionalNativeModule } from 'expo';

/**
 * Kotlin side: android/src/main/java/expo/modules/igrisdevice/IgrisDeviceModule.kt.
 *
 * Optional, so an APK built before this module existed loads the JS without crashing;
 * callers get null and say "rebuild the app" instead.
 */
export type NativeContact = {
  name: string;
  number: string;
  /** "Mobile", "Work", or the user's own custom label. */
  label: string;
  starred: boolean;
  primary: boolean;
};

type IgrisDeviceModule = {
  setAlarm(hour: number, minute: number, label: string | null): void;
  showAlarms(): void;
  findContacts(query: string): Promise<NativeContact[]>;
  placeCall(number: string): void;
  dial(number: string): void;
};

export default requireOptionalNativeModule<IgrisDeviceModule>('IgrisDevice');

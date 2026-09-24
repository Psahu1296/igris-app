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

/** One notification showing in the shade right now (IgrisDeviceModule.describe). */
export type NativeNotification = {
  key: string;
  packageName: string;
  /** The chat or sender: "Rahul", "Family: Mom". */
  title: string | null;
  text: string | null;
  /** Chat apps' unread messages, oldest first, at most 5. */
  messages: { sender: string | null; text: string }[];
  postedAt: number;
  category: string | null;
  ongoing: boolean;
  /** Has a full-screen intent: a ringing alarm or an incoming call, not a reminder. */
  fullScreen: boolean;
  canReply: boolean;
  /** Button titles, in order — the index is what pressAction takes. */
  actions: string[];
};

type IgrisDeviceModule = {
  setAlarm(hour: number, minute: number, label: string | null): void;
  showAlarms(): void;
  findContacts(query: string): Promise<NativeContact[]>;
  placeCall(number: string): void;
  dial(number: string): void;
  /** Google TTS's offline Hindi voice; resolves when finished or stopped. */
  speakHindi(text: string): Promise<void>;
  stopHindi(): void;
  hasNotificationAccess(): boolean;
  openNotificationAccess(): void;
  getNotifications(): Promise<NativeNotification[]>;
  reply(key: string, text: string): Promise<void>;
  pressAction(key: string, index: number): Promise<void>;
};

export default requireOptionalNativeModule<IgrisDeviceModule>('IgrisDevice');

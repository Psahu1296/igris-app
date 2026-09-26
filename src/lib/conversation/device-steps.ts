import {
  findCallee,
  performDeviceAction,
  type DeviceAction,
  type DeviceStep,
} from '@/lib/device';
import { COUNTDOWN_MS, matchFavourite, type Favourite } from '@/lib/favourites';
import { readMessages, replyTargets, speakable, stopAlarm } from '@/lib/notifications';

export const reason = (err: unknown) => (err instanceof Error ? err.message : 'Failed');

type Hooks = {
  /** Replace this turn's device step. */
  setStep: (step: DeviceStep) => void;
  /** Speak on this turn's behalf (the phone's own words, not maestro's). */
  speak: (text: string) => void;
  /** Arm a favourite's cancellable countdown for this turn. */
  startCountdown: (favourite: Favourite) => void;
};

/**
 * Carry out the device action maestro handed this turn. Runs as soon as the frame
 * arrives, not after the answer: the words come next and describe it, so the phone
 * should already be acting.
 *
 * Nothing irreversible happens on maestro's word alone. A call to anyone but a
 * favourite and a dictated reply both STOP at a confirm card; a favourite rings only
 * after a countdown you can cancel.
 *
 * Returns true when the phone itself speaks for this turn (reading messages aloud),
 * so maestro's "checking your messages" does not talk over it.
 */
export function runDeviceAction(action: DeviceAction, { setStep, speak, startCountdown }: Hooks): boolean {
  const fail = (err: unknown) => setStep({ action, status: 'failed', detail: reason(err) });
  setStep({ action, status: 'running', detail: null });

  if (action.kind === 'call') {
    matchFavourite(action.name, action.number)
      .then(async (favourite) => {
        if (favourite) {
          setStep({
            action,
            status: 'countdown',
            detail: null,
            candidates: [favourite],
            deadline: Date.now() + COUNTDOWN_MS,
          });
          startCountdown(favourite);
          return;
        }
        const candidates = await findCallee(action);
        setStep({ action, status: 'confirm', detail: null, candidates });
      })
      .catch(fail);
    return false;
  }

  if (action.kind === 'notify.read') {
    // Read and spoken here, on the phone — the messages never reach maestro.
    readMessages(action.from)
      .then((conversations) => {
        const count = conversations.length;
        setStep({
          action,
          status: 'done',
          detail: count === 0 ? 'Nothing new' : `${count} chat${count === 1 ? '' : 's'}`,
          conversations,
        });
        speak(speakable(conversations, action.from));
      })
      .catch((err: unknown) => {
        fail(err);
        speak(reason(err));
      });
    return true;
  }

  if (action.kind === 'notify.reply') {
    replyTargets(action.to)
      .then((conversations) => setStep({ action, status: 'confirm', detail: null, conversations }))
      .catch(fail);
    return false;
  }

  const done = action.kind === 'alarm.stop' ? stopAlarm(action.snooze) : performDeviceAction(action);
  done.then((detail) => setStep({ action, status: 'done', detail })).catch(fail);
  return false;
}

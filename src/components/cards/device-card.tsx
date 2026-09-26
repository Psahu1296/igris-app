import { CallCard } from '@/components/cards/call-card';
import { CountdownCard } from '@/components/cards/countdown-card';
import { DeviceChip } from '@/components/cards/device-chip';
import { MessagesCard } from '@/components/cards/messages-card';
import { ReplyCard } from '@/components/cards/reply-card';
import type { Contact, Conversation, DeviceStep } from '@/lib/device';

/**
 * The card for what a turn did on the phone. A step waiting on you (a countdown, a
 * call or a reply to confirm) gets a card with buttons; messages that were read get
 * a card to glance at; anything else is a one-line chip saying how it went.
 */
export function DeviceCard({
  step,
  accent,
  onCall,
  onReply,
  onCancel,
}: {
  step: DeviceStep;
  accent: string;
  onCall: (contact: Contact) => void;
  onReply: (target: Conversation, text: string) => void;
  onCancel: () => void;
}) {
  if (step.status === 'countdown' && step.candidates?.[0]) {
    return (
      <CountdownCard
        contact={step.candidates[0]}
        deadline={step.deadline ?? 0}
        accent={accent}
        onCall={onCall}
        onCancel={onCancel}
      />
    );
  }
  if (step.action.kind === 'notify.reply' && step.status === 'confirm' && step.conversations) {
    return (
      <ReplyCard
        text={step.action.text}
        targets={step.conversations}
        accent={accent}
        onSend={onReply}
        onCancel={onCancel}
      />
    );
  }
  if (step.action.kind === 'notify.read' && step.status === 'done' && step.conversations?.length) {
    return <MessagesCard conversations={step.conversations} accent={accent} />;
  }
  if (step.status === 'confirm' && step.candidates) {
    return <CallCard candidates={step.candidates} accent={accent} onCall={onCall} onCancel={onCancel} />;
  }
  return <DeviceChip step={step} accent={accent} />;
}

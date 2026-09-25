import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import {
  AlarmClock,
  AlertCircle,
  Check,
  Cloud,
  Copy,
  Download,
  MessageSquare,
  Phone,
  Receipt,
  Send,
  Star,
  User,
  Volume2,
  X,
  Zap,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, ToastAndroid, View } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { IgrisLoader } from '@/components/igris-loader';
import { Markdown } from '@/components/markdown';
import { PressableScale } from '@/components/pressable-scale';
import { Answer, Aside, Meta } from '@/components/typography';
import { Font, Gutter, laneColor, laneSoft, Palette, Space, Type } from '@/constants/theme';
import { describeAction, type Contact, type Conversation, type DeviceStep } from '@/lib/device';
import { saveDrawn } from '@/lib/gallery';
import { isFavourite, toggleFavourite, useFavourites } from '@/lib/favourites';
import { drawnSource, type BillCard, type Drawn, type Lane, type Phase, type QuizCard } from '@/lib/maestro';
import { useSpeakingId, useSpeech } from '@/lib/voice/use-speech';
import { useSession } from '@/state/session';

export type TurnState = {
  id: string;
  ask: string;
  answer: string | null;
  /** maestro's own words for the graph node currently running. */
  status: string | null;
  /** Which kind of work that node is — drives the loader. Null once settled. */
  phase: Phase | null;
  error: string | null;
  lane: Lane;
  elapsedMs: number | null;
  /** Something Igris did on this phone during the turn, and whether it worked. */
  device: DeviceStep | null;
  /** A tutor multiple-choice question asked in this turn. */
  quiz?: QuizCard | null;
  /** The photo sent with this ask (a local URI). Not restored from history. */
  photo?: string | null;
  /** A bill Igris read from that photo. */
  bill?: BillCard | null;
  /** A picture Igris drew in this turn. */
  drawn?: Drawn | null;
};

export function Turn({
  turn,
  onCall,
  onReply,
  onCancelCall,
  onAnswer,
}: {
  turn: TurnState;
  /** Tap an option on this turn's quiz card. Only the latest turn gets it. */
  onAnswer?: (text: string) => void;
  /** A candidate on this turn's call card was tapped. */
  onCall?: (turnId: string, contact: Contact) => void;
  /** A chat on this turn's reply card was tapped. */
  onReply?: (turnId: string, target: Conversation, text: string) => void;
  /** Cancel on any pending card — a call, a countdown or a reply. */
  onCancelCall?: (turnId: string) => void;
}) {
  // A turn is a record of what one brain did, so it keeps that brain's colour — not
  // the current mode's. See Tint in theme.ts.
  const accent = laneColor(turn.lane);
  const speech = useSpeech();
  const speaking = useSpeakingId() === turn.id;
  // YOUR bubble is chrome, not a fact about an answer, so it follows the current
  // theme (Auto / pinned lane) and recolours with it. Igris's card keeps the colour of
  // the brain that actually answered.
  const { lanePref } = useSession();
  const theme = laneColor(lanePref);
  const [copied, setCopied] = useState(false);

  const copyAnswer = async () => {
    if (!turn.answer) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(turn.answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const speakAnswer = () => {
    if (!turn.answer) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void speech.speak(turn.answer, turn.id);
  };

  return (
    <Animated.View entering={FadeInUp.springify().damping(18)} style={styles.turnContainer}>
      {/* User Question Speech Bubble */}
      <View style={styles.userWrapper}>
        <View
          style={[
            styles.userBubble,
            { backgroundColor: laneSoft(lanePref), borderColor: theme + '55' },
          ]}>
          <View style={styles.userHeader}>
            <View style={[styles.userAvatar, { backgroundColor: theme + '22' }]}>
              <User size={11} color={theme} />
            </View>
            <Text style={[styles.userBadgeText, { color: theme }]}>YOU</Text>
          </View>
          {turn.photo ? (
            <Image source={{ uri: turn.photo }} style={styles.askPhoto} contentFit="cover" />
          ) : null}
          {turn.ask || !turn.photo ? <Text style={styles.askText}>{turn.ask}</Text> : null}
        </View>
      </View>

      {/* Glass Response Card */}
      {/* Igris's card sits in the same theme as your bubble but much fainter (~6% wash
          vs 12%), so the two speakers stay apart. Its spine and avatar are NOT themed:
          they carry the colour of the brain that answered, which in Auto is how you
          tell a Mac answer from a Render one on an emerald screen. */}
      <View
        style={[
          styles.card,
          { backgroundColor: theme + '10', borderColor: theme + '2E' },
        ]}>
        {/* Glowing Accent Spine */}
        <View style={[styles.spine, { backgroundColor: accent, shadowColor: accent }]} />

        <View style={styles.content}>
          {/* Igris Header Badge */}
          <View style={styles.igrisHeader}>
            <View style={styles.igrisTitleGroup}>
              {/* Still on every settled turn — only the one being spoken moves, so a
                  long transcript is quiet and you can see which answer is talking. */}
              <View style={[styles.igrisAvatar, { backgroundColor: accent + '1E', borderColor: accent + '44' }]}>
                <IgrisLoader size={13} tint={turn.lane} state={speaking ? 'answering' : 'idle'} />
              </View>
              <Text style={styles.igrisName}>IGRIS</Text>
            </View>

            {/* Time / Lane Pill */}
            {turn.answer && turn.elapsedMs ? (
              <View style={[styles.metaPill, { backgroundColor: Palette.surfaceLift, borderColor: accent + '33' }]}>
                {turn.lane === 'local' ? (
                  <Zap size={10} color={accent} />
                ) : (
                  <Cloud size={10} color={accent} />
                )}
                <Meta style={[styles.metaText, { color: accent }]}>
                  {`${(turn.elapsedMs / 1000).toFixed(1)}s via ${turn.lane === 'local' ? 'Mac' : 'Render'}`}
                </Meta>
              </View>
            ) : null}
          </View>

          {/* Response Text */}
          {turn.answer ? <Markdown text={turn.answer} accent={accent} /> : null}

          {turn.device?.status === 'countdown' && turn.device.candidates?.[0] ? (
            <CountdownCard
              contact={turn.device.candidates[0]}
              deadline={turn.device.deadline ?? 0}
              accent={accent}
              onCall={(contact) => onCall?.(turn.id, contact)}
              onCancel={() => onCancelCall?.(turn.id)}
            />
          ) : turn.device?.action.kind === 'notify.reply' &&
            turn.device.status === 'confirm' &&
            turn.device.conversations ? (
            <ReplyCard
              text={turn.device.action.text}
              targets={turn.device.conversations}
              accent={accent}
              onSend={(target, text) => onReply?.(turn.id, target, text)}
              onCancel={() => onCancelCall?.(turn.id)}
            />
          ) : turn.device?.action.kind === 'notify.read' &&
            turn.device.status === 'done' &&
            turn.device.conversations?.length ? (
            <MessagesCard conversations={turn.device.conversations} accent={accent} />
          ) : turn.device?.status === 'confirm' && turn.device.candidates ? (
            <CallCard
              candidates={turn.device.candidates}
              accent={accent}
              onCall={(contact) => onCall?.(turn.id, contact)}
              onCancel={() => onCancelCall?.(turn.id)}
            />
          ) : turn.device ? (
            <DeviceChip step={turn.device} accent={accent} />
          ) : null}

          {turn.drawn ? <DrawnPicture lane={turn.lane} picture={turn.drawn} /> : null}

          {turn.bill ? <BillFields bill={turn.bill} accent={accent} /> : null}

          {turn.quiz ? <QuizOptions card={turn.quiz} accent={accent} onAnswer={onAnswer} /> : null}

          {/* Animated Thinking Row */}
          {!turn.answer && turn.status ? (
            <View style={styles.thinkingRow}>
              <IgrisLoader size={26} tint={turn.lane} state={turn.phase ?? 'thinking'} />
              <Aside style={styles.statusText}>{turn.status}</Aside>
            </View>
          ) : null}

          {/* Error Box */}
          {turn.error ? (
            <View style={styles.errorBox}>
              <AlertCircle size={15} color={Palette.alert} />
              <Answer style={styles.errorText}>{turn.error}</Answer>
            </View>
          ) : null}

          {/* Response Action Bar (Copy & Replay) */}
          {turn.answer ? (
            <View style={styles.actionsRow}>
              <PressableScale
                onPress={copyAnswer}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Copy response"
                style={styles.actionButton}>
                {copied ? (
                  <>
                    <Check size={13} color={accent} />
                    <Meta style={[styles.actionText, { color: accent }]}>Copied</Meta>
                  </>
                ) : (
                  <>
                    <Copy size={13} color={Palette.muted} />
                    <Meta style={styles.actionText}>Copy</Meta>
                  </>
                )}
              </PressableScale>

              <PressableScale
                onPress={speakAnswer}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Speak response"
                style={styles.actionButton}>
                <Volume2 size={13} color={Palette.muted} />
                <Meta style={styles.actionText}>Speak</Meta>
              </PressableScale>
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * What Igris did on the phone. The spoken answer says what it WILL do; this says
 * what happened — the two differ exactly when the Clock refused, which is the case
 * you need to see.
 */
function DeviceChip({ step, accent }: { step: DeviceStep; accent: string }) {
  const failed = step.status === 'failed';
  const color = failed ? Palette.alert : step.status === 'cancelled' ? Palette.muted : accent;
  const kind = step.action.kind;
  const Icon = kind === 'call' ? Phone : kind.startsWith('notify') ? MessageSquare : AlarmClock;
  // Once a call is placed the card collapses to the one person actually rung.
  const callee = step.action.kind === 'call' ? step.candidates?.[0] : undefined;
  return (
    <View style={[styles.deviceChip, { borderColor: color + '44', backgroundColor: color + '12' }]}>
      {step.status === 'running' ? (
        <IgrisLoader size={14} tint="auto" state="working" />
      ) : (
        <Icon size={14} color={color} />
      )}
      <Meta style={[styles.deviceText, { color: Palette.text }]} numberOfLines={2}>
        {callee ? `${callee.name} · ${callee.label}` : describeAction(step.action)}
        {step.detail ? <Meta style={{ color }}>{`  ·  ${step.detail}`}</Meta> : null}
      </Meta>
      {step.status === 'done' ? <Check size={14} color={color} /> : null}
      {failed ? <AlertCircle size={14} color={color} /> : null}
      {callee && step.status === 'done' ? <StarToggle contact={callee} accent={accent} /> : null}
    </View>
  );
}

/** Add or remove someone from quick call, from wherever you just called them. */
function StarToggle({ contact, accent }: { contact: Contact; accent: string }) {
  const starred = isFavourite(useFavourites(), contact);
  return (
    <PressableScale
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleFavourite(contact);
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={starred ? `Remove ${contact.name} from quick call` : `Add ${contact.name} to quick call`}>
      <Star size={16} color={starred ? accent : Palette.faint} fill={starred ? accent : 'transparent'} />
    </PressableScale>
  );
}

/**
 * A quick-call favourite, about to ring. The bar drains to the deadline and the call
 * goes out when it empties (index.tsx owns the timer; this only draws it). Cancel and
 * "no" both stop it; Call now skips the wait.
 */
function CountdownCard({
  contact,
  deadline,
  accent,
  onCall,
  onCancel,
}: {
  contact: Contact;
  /** Epoch ms. A past (or 0) deadline draws an empty bar. */
  deadline: number;
  accent: string;
  onCall: (contact: Contact) => void;
  onCancel: () => void;
}) {
  const left = useSharedValue(1);
  useEffect(() => {
    left.value = withTiming(0, {
      duration: Math.max(0, deadline - Date.now()),
      easing: Easing.linear,
    });
  }, [deadline, left]);
  const bar = useAnimatedStyle(() => ({ width: `${left.value * 100}%` }));

  return (
    <View style={[styles.callCard, { borderColor: accent + '44', backgroundColor: accent + '0C' }]}>
      <Meta style={styles.callPrompt}>Calling — say “no” to stop</Meta>
      <View style={styles.callRow}>
        <View style={styles.callWho}>
          <Text style={styles.callName} numberOfLines={1}>
            {contact.name}
          </Text>
          <Meta style={styles.callNumber} numberOfLines={1}>
            {`${contact.label} · ${contact.number}`}
          </Meta>
        </View>
        <PressableScale
          onPress={() => onCall(contact)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Call ${contact.name} now`}
          style={[styles.callButton, { backgroundColor: accent }]}>
          <Phone size={16} color={Palette.ground} />
        </PressableScale>
      </View>
      <View style={styles.countdownTrack}>
        <Animated.View style={[styles.countdownBar, { backgroundColor: accent }, bar]} />
      </View>
      <PressableScale
        onPress={onCancel}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Cancel call"
        style={styles.callCancel}>
        <X size={13} color={Palette.muted} />
        <Meta style={styles.actionText}>Cancel</Meta>
      </PressableScale>
    </View>
  );
}

/**
 * "Call who?" — the stop between maestro's proposal and a ringing phone. One row per
 * candidate, best match first, each with its own Call button: with two Rahuls, the
 * choice is yours, not the ranking's.
 */
function CallCard({
  candidates,
  accent,
  onCall,
  onCancel,
}: {
  candidates: Contact[];
  accent: string;
  onCall: (contact: Contact) => void;
  onCancel: () => void;
}) {
  return (
    <View style={[styles.callCard, { borderColor: accent + '44', backgroundColor: accent + '0C' }]}>
      <Meta style={styles.callPrompt}>
        {candidates.length === 1 ? 'Call? Say “yes”, or tap' : 'Which one?'}
      </Meta>
      {candidates.map((contact) => (
        <View key={`${contact.name}|${contact.number}`} style={styles.callRow}>
          <View style={styles.callWho}>
            <Text style={styles.callName} numberOfLines={1}>
              {contact.name}
            </Text>
            <Meta style={styles.callNumber} numberOfLines={1}>
              {`${contact.label} · ${contact.number}`}
            </Meta>
          </View>
          <StarToggle contact={contact} accent={accent} />
          <PressableScale
            onPress={() => onCall(contact)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Call ${contact.name}, ${contact.label}`}
            style={[styles.callButton, { backgroundColor: accent }]}>
            <Phone size={16} color={Palette.ground} />
          </PressableScale>
        </View>
      ))}
      <PressableScale
        onPress={onCancel}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Cancel call"
        style={styles.callCancel}>
        <X size={13} color={Palette.muted} />
        <Meta style={styles.actionText}>Cancel</Meta>
      </PressableScale>
    </View>
  );
}

/**
 * "Send this?" — a dictated reply waits here for a yes, like a call: speech
 * recognition wrote the text, and a message sent to the wrong chat cannot be unsent.
 */
function ReplyCard({
  text,
  targets,
  accent,
  onSend,
  onCancel,
}: {
  text: string;
  targets: Conversation[];
  accent: string;
  onSend: (target: Conversation, text: string) => void;
  onCancel: () => void;
}) {
  return (
    <View style={[styles.callCard, { borderColor: accent + '44', backgroundColor: accent + '0C' }]}>
      <Meta style={styles.callPrompt}>
        {targets.length === 1 ? 'Send? Say “yes”, or tap' : 'Which chat?'}
      </Meta>
      <Text style={styles.replyText}>{`“${text}”`}</Text>
      {targets.map((target) => (
        <View key={target.key} style={styles.callRow}>
          <View style={styles.callWho}>
            <Text style={styles.callName} numberOfLines={1}>
              {target.title}
            </Text>
            <Meta style={styles.callNumber} numberOfLines={1}>
              {`${target.app} · ${target.lines[target.lines.length - 1]?.text ?? ''}`}
            </Meta>
          </View>
          <PressableScale
            onPress={() => onSend(target, text)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Send to ${target.title} on ${target.app}`}
            style={[styles.callButton, { backgroundColor: accent }]}>
            <Send size={16} color={Palette.ground} />
          </PressableScale>
        </View>
      ))}
      <PressableScale
        onPress={onCancel}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Cancel reply"
        style={styles.callCancel}>
        <X size={13} color={Palette.muted} />
        <Meta style={styles.actionText}>Cancel</Meta>
      </PressableScale>
    </View>
  );
}

const LETTERS = 'ABCD';

/**
 * A tutor question's answer buttons. The options themselves are in the answer text
 * (maestro lists them as "A · …"), so the card is just the letters — tapping one
 * sends it as the next message, the same thing saying "B" does. Once answered (a
 * later turn exists) the buttons stay visible but stop responding.
 */
function QuizOptions({
  card,
  accent,
  onAnswer,
}: {
  card: QuizCard;
  accent: string;
  onAnswer?: (text: string) => void;
}) {
  return (
    <View style={styles.quizRow}>
      {card.options.map((option, i) => (
        <PressableScale
          key={option}
          disabled={!onAnswer}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAnswer?.(LETTERS[i]);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${LETTERS[i]}: ${option}`}
          style={[
            styles.quizLetter,
            { borderColor: accent + '66', backgroundColor: accent + '14' },
            !onAnswer && styles.quizDone,
          ]}>
          <Text style={[styles.quizLetterText, { color: accent }]}>{LETTERS[i]}</Text>
        </PressableScale>
      ))}
    </View>
  );
}

/**
 * A picture Igris drew, loaded from the Mac with the session token. Square, as
 * maestro draws it (imagine.IMAGE_SIZE). A failed load says so instead of leaving a
 * blank box — most often a conversation reopened on Render, which has no pictures.
 */
function DrawnPicture({ lane, picture }: { lane: Lane; picture: Drawn }) {
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    drawnSource(lane, picture.name)
      .then((s) => live && setSource(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [lane, picture.name]);

  if (failed) return <Meta style={styles.drawnFailed}>The picture is on the Mac and could not be loaded.</Meta>;
  if (!source) return <View style={styles.drawn} />;
  return (
    <View>
      <Image
        source={source}
        style={styles.drawn}
        contentFit="cover"
        transition={200}
        accessibilityLabel={picture.prompt || 'A picture Igris drew'}
        onError={() => setFailed(true)}
      />
      <SaveButton lane={lane} name={picture.name} />
    </View>
  );
}

/** Download a drawn picture into the gallery's "Igris" album (lib/gallery.ts). */
function SaveButton({ lane, name }: { lane: Lane; name: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const save = async () => {
    if (state !== 'idle') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setState('saving');
    try {
      await saveDrawn(lane, name);
      setState('saved');
      ToastAndroid.show('Saved to your gallery, in the Igris album.', ToastAndroid.SHORT);
    } catch (err) {
      setState('idle');
      ToastAndroid.show(err instanceof Error ? err.message : 'Could not save the picture.', ToastAndroid.LONG);
    }
  };

  return (
    <PressableScale
      onPress={() => void save()}
      disabled={state !== 'idle'}
      accessibilityRole="button"
      accessibilityLabel={state === 'saved' ? 'Saved to gallery' : 'Save to gallery'}
      style={styles.saveButton}>
      {state === 'saved' ? (
        <Check size={16} color={Palette.text} />
      ) : (
        <Download size={16} color={Palette.text} style={state === 'saving' ? styles.saving : undefined} />
      )}
    </PressableScale>
  );
}

const rupees = (amount: number | null) =>
  amount === null ? '?' : `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * A read bill laid out as Bill-App's Add Expense form asks for it (type, name,
 * amount, date, description), so entering it by hand is copying down four lines.
 * Nothing here is saved; Copy puts the same lines on the clipboard.
 */
function BillFields({ bill, accent }: { bill: BillCard; accent: string }) {
  const [copied, setCopied] = useState(false);
  const description = bill.items
    .map((i) => (i.quantity !== null ? `${i.name} ${i.quantity}${i.unit ? ' ' + i.unit : ''}` : i.name))
    .join(', ');
  const fields: [string, string][] = [
    ['Type', bill.type],
    ['Name', bill.vendor ?? '—'],
    ['Amount', rupees(bill.total)],
    ['Date', bill.date ?? 'not printed'],
    ['Description', description || '—'],
  ];

  const copy = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(fields.map(([k, v]) => `${k}: ${v}`).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[styles.callCard, { borderColor: accent + '44', backgroundColor: accent + '0C' }]}>
      <View style={styles.chatHead}>
        <Receipt size={13} color={accent} />
        <Text style={styles.chatTitle}>For Bill-App</Text>
        <PressableScale onPress={() => void copy()} accessibilityRole="button" accessibilityLabel="Copy the expense">
          <Meta style={{ color: accent }}>{copied ? 'Copied' : 'Copy'}</Meta>
        </PressableScale>
      </View>
      {fields.map(([label, value]) => (
        <View key={label} style={styles.billRow}>
          <Meta style={styles.billLabel}>{label}</Meta>
          <Text style={styles.billValue} numberOfLines={label === 'Description' ? 3 : 1}>
            {value}
          </Text>
        </View>
      ))}
      {bill.mismatch ? (
        <View style={styles.billRow}>
          <AlertCircle size={13} color={Palette.alert} />
          <Meta style={styles.billWarn}>
            {`The lines add up to ${rupees(bill.items_total)}, not ${rupees(bill.total)}. Check the bill.`}
          </Meta>
        </View>
      ) : null}
    </View>
  );
}

/** What was read aloud, to glance at instead of listening. Newest chat first. */
function MessagesCard({ conversations, accent }: { conversations: Conversation[]; accent: string }) {
  return (
    <View style={[styles.callCard, { borderColor: accent + '44', backgroundColor: accent + '0C' }]}>
      {conversations.map((c) => (
        <View key={c.key} style={styles.chat}>
          <View style={styles.chatHead}>
            <MessageSquare size={13} color={accent} />
            <Text style={styles.chatTitle} numberOfLines={1}>
              {c.title}
            </Text>
            <Meta style={styles.callNumber}>{c.app}</Meta>
          </View>
          {c.lines.slice(-3).map((line, i) => (
            <Meta key={i} style={styles.chatLine} numberOfLines={3}>
              {line.sender && line.sender !== c.title ? `${line.sender}: ${line.text}` : line.text}
            </Meta>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  turnContainer: {
    marginBottom: Space.xl,
    paddingHorizontal: Gutter,
    gap: Space.sm,
  },
  userWrapper: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: Space.xs,
  },
  userBubble: {
    maxWidth: '88%',
    backgroundColor: Palette.surfaceLift,
    borderColor: Palette.hairlineBright,
    borderWidth: 1,
    borderRadius: 18,
    borderTopRightRadius: 4,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    gap: Space.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 2,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  userAvatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Palette.surfaceGlass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userBadgeText: {
    fontFamily: Font.uiMedium,
    color: Palette.muted,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  drawn: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: Palette.surfaceLift,
  },
  drawnFailed: { color: Palette.muted },
  saveButton: {
    position: 'absolute',
    right: Space.sm,
    bottom: Space.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9, 8, 14, 0.7)',
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
  },
  saving: { opacity: 0.4 },
  askPhoto: {
    width: 180,
    height: 180,
    borderRadius: 12,
    marginBottom: Space.xs,
  },
  billRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.sm },
  billLabel: { width: 84, color: Palette.muted },
  billValue: { flex: 1, color: Palette.text, fontFamily: Font.ui, fontSize: 14 },
  billWarn: { flex: 1, color: Palette.muted },
  askText: {
    fontFamily: Font.ui,
    color: Palette.text,
    ...Type.ask,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Palette.surfaceGlass,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  spine: {
    width: 3.5,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  content: {
    flex: 1,
    padding: Space.lg,
    gap: Space.sm,
  },
  igrisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  igrisTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  igrisAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  igrisName: {
    fontFamily: Font.voiceMedium,
    color: Palette.muted,
    fontSize: 12,
    letterSpacing: 1,
  },
  deviceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: 10,
    borderWidth: 1,
  },
  quizRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.xs },
  quizDone: { opacity: 0.45 },
  quizLetter: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizLetterText: { fontFamily: Font.uiMedium, fontSize: 17 },
  callCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Space.md,
    gap: Space.sm,
  },
  callPrompt: {
    color: Palette.muted,
    fontSize: 12,
  },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  callWho: {
    flex: 1,
  },
  callName: {
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    fontSize: 16,
  },
  callNumber: {
    color: Palette.muted,
    fontSize: 12,
  },
  callButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyText: {
    fontFamily: Font.voice,
    color: Palette.text,
    fontSize: 15,
    lineHeight: 21,
  },
  chat: {
    gap: 2,
  },
  chatHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  chatTitle: {
    flexShrink: 1,
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    fontSize: 14,
  },
  chatLine: {
    color: Palette.muted,
    fontSize: 13,
    lineHeight: 18,
    paddingLeft: 13 + Space.xs,
  },
  countdownTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: Palette.hairline,
    overflow: 'hidden',
  },
  countdownBar: {
    height: 3,
  },
  callCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 2,
  },
  deviceText: {
    flexShrink: 1,
    fontSize: 13,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  statusText: {
    color: Palette.muted,
    fontSize: 13,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.md,
    borderRadius: 10,
    backgroundColor: Palette.surfaceLift,
    borderWidth: 1,
    borderColor: Palette.alert + '33',
  },
  errorText: {
    color: Palette.alert,
    fontSize: 14,
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.xs,
    paddingTop: Space.xs,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: Palette.surfaceLift,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  actionText: {
    color: Palette.muted,
    fontSize: 11,
    fontFamily: Font.uiMedium,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  metaText: {
    fontFamily: Font.uiMedium,
    fontSize: 10,
  },
});

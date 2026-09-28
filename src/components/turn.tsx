import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { AlertCircle, Check, ChevronsDown, Cloud, Copy, User, Volume2, Zap } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { BillFields } from '@/components/cards/bill-fields';
import { DeviceCard } from '@/components/cards/device-card';
import { DrawnPicture } from '@/components/cards/drawn-picture';
import { QuizOptions } from '@/components/cards/quiz-options';
import { ScoutCard, ScoutPending } from '@/components/cards/scout-card';
import { SosCard } from '@/components/cards/sos-card';
import { IgrisLoader } from '@/components/igris-loader';
import { Markdown } from '@/components/markdown';
import { PressableScale } from '@/components/pressable-scale';
import { Answer, Aside, Meta } from '@/components/typography';
import { Font, Gutter, laneColor, laneSoft, Palette, Space, Type } from '@/constants/theme';
import type { TurnState } from '@/lib/conversation/turn-state';
import type { Contact, Conversation } from '@/lib/device';
import { revealed } from '@/lib/hint';
import { useSpeakingId, useSpeech } from '@/lib/voice/use-speech';
import { useSession } from '@/state/session';

export function Turn({
  turn,
  onCall,
  onReply,
  onCancelCall,
  onAnswer,
  onNextStep,
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
  /** Hint mode: show the next step of this turn's solution. */
  onNextStep?: (turnId: string) => void;
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

  // Hint mode shows the solution a step at a time (lib/hint.ts).
  const shown = turn.answer && turn.reveal ? revealed(turn.answer, turn.reveal) : null;
  const visible = shown?.text ?? turn.answer;

  const speakAnswer = () => {
    if (!visible) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void speech.speak(visible, turn.id, true);
  };

  return (
    <Animated.View entering={FadeInUp.springify().damping(18)} style={styles.turnContainer}>
      {/* User Question Speech Bubble — none on a Scout report, which nobody asked just then */}
      {turn.report ? null : (
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
      )}

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
          {visible ? <Markdown text={visible} accent={accent} /> : null}

          {shown?.hidden ? (
            <PressableScale
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onNextStep?.(turn.id);
              }}
              accessibilityRole="button"
              accessibilityLabel="Show the next step"
              style={[styles.nextStep, { borderColor: accent + '55' }]}>
              <ChevronsDown size={15} color={accent} />
              <Meta style={[styles.actionText, { color: accent }]}>
                {`Next step · ${shown.hidden} left — or say "next"`}
              </Meta>
            </PressableScale>
          ) : null}

          {turn.device ? (
            <DeviceCard
              step={turn.device}
              accent={accent}
              onCall={(contact) => onCall?.(turn.id, contact)}
              onReply={(target, text) => onReply?.(turn.id, target, text)}
              onCancel={() => onCancelCall?.(turn.id)}
            />
          ) : null}

          {turn.sos ? <SosCard /> : null}

          {turn.drawn ? <DrawnPicture lane={turn.lane} picture={turn.drawn} /> : null}

          {turn.bill ? <BillFields bill={turn.bill} accent={accent} /> : null}

          {turn.quiz ? <QuizOptions card={turn.quiz} accent={accent} onAnswer={onAnswer} /> : null}

          {turn.scout && turn.report ? <ScoutCard lane={turn.lane} jobId={turn.scout} accent={accent} /> : null}
          {turn.scout && !turn.report ? <ScoutPending accent={accent} /> : null}

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

const styles = StyleSheet.create({
  nextStep: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Space.xs,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
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
  askPhoto: {
    width: 180,
    height: 180,
    borderRadius: 12,
    marginBottom: Space.xs,
  },
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
});

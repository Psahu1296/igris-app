import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Check, Copy, Menu } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Composer } from '@/components/composer';
import { Empty, Opening } from '@/components/empty-state';
import { IgrisMark } from '@/components/igris-mark';
import { LaneBadge } from '@/components/lane-badge';
import { LaneMenu } from '@/components/lane-menu';
import { PressableScale } from '@/components/pressable-scale';
import { Sessions } from '@/components/sessions';
import { SideDrawer } from '@/components/side-drawer';
import { Turn } from '@/components/turn';
import { Title } from '@/components/typography';
import { Gutter, laneColor, Palette, Space, Font } from '@/constants/theme';
import { useConversation } from '@/lib/conversation/use-conversation';
import { formatTranscript } from '@/lib/transcript';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import { useListening } from '@/lib/voice/use-listening';
import { useSession } from '@/state/session';

/**
 * The transcript screen: header, the conversation, the composer, and the sheets it
 * opens. What the conversation does — asking, history, calls — is useConversation.
 */
export default function Transcript() {
  const {
    lane,
    probing,
    lanePref,
    laneReachable,
    chooseLane,
    signOut,
    sessionId,
    openSession,
    startSession,
  } = useSession();
  const { turns, busy, history, ask, quickCall, confirmCall, confirmReply, cancelCall } = useConversation();
  const [laneMenuOpen, setLaneMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copiedChat, setCopiedChat] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const bottomInset = useKeyboardInset();
  const listening = useListening(lane, laneReachable);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={[styles.fill, { paddingBottom: bottomInset }]}>
        {/* Modern Glass Header Bar */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <PressableScale
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDrawerOpen(true);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Open menu"
              style={styles.headerIconButton}>
              <Menu size={16} color={Palette.text} />
            </PressableScale>
            <IgrisMark size={22} tint={lanePref} />
            <Title style={styles.headerTitle}>Igris</Title>
          </View>

          <View style={styles.headerActions}>
            {/* Whole-conversation copy, for eval sets and prompt reviews. Icon-only:
                the header already carries three labelled pills, and it only exists
                once there is something to copy. */}
            {turns.length > 0 ? (
              <PressableScale
                onPress={async () => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  await Clipboard.setStringAsync(formatTranscript(turns, sessionId));
                  setCopiedChat(true);
                  setTimeout(() => setCopiedChat(false), 2000);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={copiedChat ? 'Conversation copied' : 'Copy whole conversation'}
                style={styles.headerIconButton}>
                {copiedChat ? (
                  <Check size={14} color={laneColor(lanePref)} />
                ) : (
                  <Copy size={14} color={Palette.text} />
                )}
              </PressableScale>
            ) : null}

            <LaneBadge
              lane={lane}
              probing={probing}
              pinned={lanePref !== 'auto'}
              reachable={laneReachable}
              onPress={() => setLaneMenuOpen(true)}
            />
          </View>
        </View>

        <ScrollView
          ref={scroller}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
          keyboardDismissMode="on-drag">
          {turns.length === 0 && history !== 'ready' ? (
            <Opening tint={lanePref} error={history === 'loading' ? null : history.error} />
          ) : turns.length === 0 ? (
            <Empty
              lane={lane}
              tint={lanePref}
              reachable={laneReachable}
              busy={busy}
              onPick={ask}
              onQuickCall={quickCall}
              onSignOut={() => void signOut()}
            />
          ) : (
            turns.map((turn, i) => (
              <Turn
                key={turn.id}
                turn={turn}
                onCall={confirmCall}
                onReply={confirmReply}
                onCancelCall={cancelCall}
                onAnswer={i === turns.length - 1 && !busy ? (text) => void ask(text) : undefined}
              />
            ))
          )}
        </ScrollView>

        <Composer
          lane={lane}
          busy={busy}
          onSend={(m, photo) => void ask(m, photo ? { photo } : undefined)}
          voice={{
            available: listening.available,
            state: listening.state,
            start: () => void listening.start((text) => void ask(text)),
            stop: () => void listening.stop(),
          }}
        />
      </View>

      <Sessions
        visible={browsing}
        lane={lane}
        currentId={sessionId}
        onOpen={(id) => {
          setBrowsing(false);
          void openSession(id);
        }}
        onNew={() => {
          setBrowsing(false);
          void startSession();
        }}
        onClose={() => setBrowsing(false)}
      />

      <SideDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenVoice={() => router.push('/voice')}
        onOpenChats={() => setBrowsing(true)}
        onOpenTodos={() => router.push('/todos')}
        onOpenFavourites={() => router.push('/favourites')}
        onNewConversation={() => void startSession()}
        onSignOut={() => void signOut()}
        lane={lane}
        lanePref={lanePref}
        reachable={laneReachable}
        onOpenLaneMenu={() => setLaneMenuOpen(true)}
      />

      <LaneMenu
        visible={laneMenuOpen}
        lane={lane}
        lanePref={lanePref}
        reachable={laneReachable}
        onChoose={(pref) => void chooseLane(pref)}
        onClose={() => setLaneMenuOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
    backgroundColor: Palette.ground,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  headerTitle: {
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    fontSize: 24,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  headerIconButton: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: Space.md, paddingBottom: Space.xl },
});

import * as Haptics from 'expo-haptics';
import {
  ChevronRight,
  Cloud,
  ListTodo,
  LogOut,
  MessageSquare,
  Mic,
  Plus,
  Radar,
  Users,
  X,
  Zap,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IgrisMark } from '@/components/igris-mark';
import { PressableScale } from '@/components/pressable-scale';
import { Answer, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space, Type } from '@/constants/theme';
import type { Lane } from '@/lib/config';
import type { LanePreference } from '@/lib/maestro';

/** How long the slide-out runs; the Modal stays up that long so it is seen. */
const EXIT_MS = 220;

interface SideDrawerProps {
  visible: boolean;
  onClose: () => void;
  onOpenVoice: () => void;
  onOpenChats: () => void;
  onOpenTodos: () => void;
  onOpenFavourites: () => void;
  onNewConversation: () => void;
  onSignOut: () => void;
  lane: Lane;
  lanePref: LanePreference;
  reachable: boolean;
  onOpenLaneMenu: () => void;
}

export function SideDrawer({
  visible,
  onClose,
  onOpenVoice,
  onOpenChats,
  onOpenTodos,
  onOpenFavourites,
  onNewConversation,
  onSignOut,
  lane,
  lanePref,
  reachable,
  onOpenLaneMenu,
}: SideDrawerProps) {
  const accent = laneColor(lanePref);

  // The Modal outlives `visible` by EXIT_MS. Returning null (or hiding the Modal) the
  // moment `visible` went false unmounted the panel before Reanimated could run its
  // exiting animation, so the drawer snapped shut instead of sliding out.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  useEffect(() => {
    if (visible || !mounted) return;
    const timer = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [visible, mounted]);

  const handleAction = (action: () => void) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    setTimeout(() => {
      action();
    }, 150);
  };

  if (!mounted) return null;

  return (
    // Translucent bars so the drawer runs under the status and navigation bars; the
    // SafeAreaView inside keeps its content clear of them.
    <Modal
      visible
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      onRequestClose={onClose}>
      {visible ? (
        // Sized to the physical screen, not flex: under edge-to-edge RN's Modal lays its
        // content out as the screen minus BOTH system bars but starts it at the top, so a
        // flex:1 drawer ended ~156px short and the chat's composer showed under "Sign out"
        // (OnePlus 11R, 2026-09-24). The Modal's window itself is full screen.
        <View style={[styles.modalOverlay, { height: Dimensions.get('screen').height }]}>
          {/* Semi-transparent Backdrop */}
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(EXIT_MS)}
            style={styles.backdrop}>
            <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Close menu" />
          </Animated.View>

          {/* Sliding Drawer Panel */}
          <Animated.View
            entering={SlideInLeft.duration(250)}
            exiting={SlideOutLeft.duration(EXIT_MS)}
            style={styles.drawerPanel}>
            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
              {/* Header with Brand */}
              <View style={styles.header}>
                <View style={styles.brandRow}>
                  <IgrisMark size={26} tint={lanePref} />
                  <View>
                    <Title style={styles.brandTitle}>Igris</Title>
                    <Meta style={styles.brandSubtitle}>SYSTEM ASSISTANT</Meta>
                  </View>
                </View>
                <PressableScale
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onClose();
                  }}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Close side menu"
                  style={styles.closeButton}>
                  <X size={18} color={Palette.text} />
                </PressableScale>
              </View>

              {/* Quick Primary Action: New Conversation */}
              <View style={styles.newConvWrapper}>
                <PressableScale
                  onPress={() => handleAction(onNewConversation)}
                  accessibilityRole="button"
                  style={[styles.newConvButton, { backgroundColor: accent, shadowColor: accent }]}>
                  <Plus size={18} color={Palette.ground} />
                  <Text style={styles.newConvText}>New Conversation</Text>
                </PressableScale>
              </View>

              {/* Navigation Links */}
              <View style={styles.section}>
                <Meta style={styles.sectionHeader}>NAVIGATION</Meta>

                {/* Chats & Threads */}
                <PressableScale
                  onPress={() => handleAction(onOpenChats)}
                  accessibilityRole="button"
                  style={styles.navRow}>
                  <View style={[styles.navIconBox, { backgroundColor: accent + '1A' }]}>
                    <MessageSquare size={18} color={accent} />
                  </View>
                  <View style={styles.navTextGroup}>
                    <Answer style={styles.navLabel}>Chats & History</Answer>
                    <Meta style={styles.navHint}>Search past threads & conversations</Meta>
                  </View>
                  <ChevronRight size={16} color={Palette.faint} />
                </PressableScale>

                {/* Voice Mode */}
                <PressableScale
                  onPress={() => handleAction(onOpenVoice)}
                  accessibilityRole="button"
                  style={styles.navRow}>
                  <View style={[styles.navIconBox, { backgroundColor: accent + '1A' }]}>
                    <Mic size={18} color={accent} />
                  </View>
                  <View style={styles.navTextGroup}>
                    <Answer style={styles.navLabel}>Voice Mode</Answer>
                    <Meta style={styles.navHint}>On-device Piper TTS & voice models</Meta>
                  </View>
                  <ChevronRight size={16} color={Palette.faint} />
                </PressableScale>

                {/* Todos & Alarms */}
                <PressableScale
                  onPress={() => handleAction(onOpenTodos)}
                  accessibilityRole="button"
                  style={styles.navRow}>
                  <View style={[styles.navIconBox, { backgroundColor: accent + '1A' }]}>
                    <ListTodo size={18} color={accent} />
                  </View>
                  <View style={styles.navTextGroup}>
                    <Answer style={styles.navLabel}>Todos & Routines</Answer>
                    <Meta style={styles.navHint}>Scheduled tasks, alarms & tutor</Meta>
                  </View>
                  <ChevronRight size={16} color={Palette.faint} />
                </PressableScale>

                {/* Quick Dial Favourites */}
                <PressableScale
                  onPress={() => handleAction(onOpenFavourites)}
                  accessibilityRole="button"
                  style={styles.navRow}>
                  <View style={[styles.navIconBox, { backgroundColor: accent + '1A' }]}>
                    <Users size={18} color={accent} />
                  </View>
                  <View style={styles.navTextGroup}>
                    <Answer style={styles.navLabel}>Quick Call Contacts</Answer>
                    <Meta style={styles.navHint}>Manage instant dial favourites</Meta>
                  </View>
                  <ChevronRight size={16} color={Palette.faint} />
                </PressableScale>
              </View>

              {/* Active Lane Card */}
              <View style={styles.section}>
                <Meta style={styles.sectionHeader}>ACTIVE BRAIN</Meta>
                <PressableScale
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onClose();
                    setTimeout(onOpenLaneMenu, 150);
                  }}
                  accessibilityRole="button"
                  style={styles.laneCard}>
                  <View style={[styles.laneIconBox, { backgroundColor: accent + '22' }]}>
                    {lanePref === 'auto' ? (
                      <Radar size={16} color={accent} />
                    ) : lane === 'local' ? (
                      <Zap size={16} color={accent} />
                    ) : (
                      <Cloud size={16} color={accent} />
                    )}
                  </View>
                  <View style={styles.laneTextGroup}>
                    <Text style={styles.laneTitle}>
                      {lanePref === 'auto'
                        ? `Auto Mode (${lane === 'local' ? 'Mac' : 'Render'})`
                        : lanePref === 'local'
                          ? 'Mac (Pinned)'
                          : 'Render (Pinned)'}
                    </Text>
                    <Meta style={styles.laneDesc}>
                      {lane === 'cloud'
                        ? 'Render Cloud · limited tools'
                        : reachable
                          ? 'Mac · all tools active'
                          : 'Mac unreachable'}
                    </Meta>
                  </View>
                  <ChevronRight size={16} color={Palette.faint} />
                </PressableScale>
              </View>

              {/* Spacer */}
              <View style={styles.flexSpacer} />

              {/* Footer Sign Out */}
              <View style={styles.footer}>
                <PressableScale
                  onPress={() => handleAction(onSignOut)}
                  accessibilityRole="button"
                  style={styles.signOutButton}>
                  <LogOut size={16} color={Palette.faint} />
                  <Meta style={styles.signOutText}>Sign out session</Meta>
                </PressableScale>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 4, 9, 0.75)',
  },
  fill: {
    flex: 1,
  },
  drawerPanel: {
    width: '82%',
    maxWidth: 320,
    alignSelf: 'stretch',
    backgroundColor: Palette.ground,
    borderRightWidth: 1,
    borderRightColor: Palette.hairlineBright,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Gutter,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Space.lg,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  brandTitle: {
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    fontSize: 22,
    lineHeight: 26,
  },
  brandSubtitle: {
    color: Palette.faint,
    fontSize: 9,
    letterSpacing: 1.2,
    fontFamily: Font.uiMedium,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Palette.surfaceLift,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  newConvWrapper: {
    marginVertical: Space.lg,
  },
  newConvButton: {
    height: 46,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  newConvText: {
    fontFamily: Font.uiMedium,
    color: Palette.ground,
    ...Type.ask,
  },
  section: {
    marginBottom: Space.lg,
    gap: Space.xs,
  },
  sectionHeader: {
    fontSize: 10,
    letterSpacing: 1.2,
    color: Palette.faint,
    marginBottom: Space.xs,
    fontFamily: Font.uiMedium,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.sm,
    borderRadius: 12,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
    marginBottom: Space.xs,
  },
  navIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTextGroup: {
    flex: 1,
  },
  navLabel: {
    color: Palette.text,
    fontFamily: Font.uiMedium,
    fontSize: 14,
  },
  navHint: {
    color: Palette.muted,
    fontSize: 11,
  },
  laneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.sm,
    borderRadius: 12,
    backgroundColor: Palette.surfaceLift,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  laneIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laneTextGroup: {
    flex: 1,
  },
  laneTitle: {
    color: Palette.text,
    fontFamily: Font.uiMedium,
    fontSize: 13,
  },
  laneDesc: {
    color: Palette.muted,
    fontSize: 11,
  },
  flexSpacer: {
    flex: 1,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    paddingTop: Space.md,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.sm,
  },
  signOutText: {
    color: Palette.faint,
    fontFamily: Font.uiMedium,
    fontSize: 13,
  },
});

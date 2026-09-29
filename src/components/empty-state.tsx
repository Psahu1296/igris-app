import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { CloudSun, CreditCard, LogOut, Plus, TrendingUp } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { IgrisLoader } from '@/components/igris-loader';
import { PressableScale } from '@/components/pressable-scale';
import { Answer, Meta } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space, Type, type Tint } from '@/constants/theme';
import type { Lane } from '@/lib/config';
import { useFavourites, type Favourite } from '@/lib/favourites';

/** Real questions, not feature advertisements — tapping one asks it. */
const OPENERS = [
  { icon: TrendingUp, text: "what's today's revenue" },
  { icon: CreditCard, text: 'who owes money' },
  { icon: CloudSun, text: 'weather in indore' },
];

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** While a conversation from Chats loads — or the reason it could not. */
export function Opening({ tint, error }: { tint: Tint; error: string | null }) {
  return (
    <Animated.View entering={FadeIn.duration(250)} style={styles.openingContainer}>
      {error ? (
        <Answer style={styles.openingError}>{`Couldn't open that conversation. ${error}`}</Answer>
      ) : (
        <>
          <IgrisLoader tint={tint} state="loading" size={56} />
          <Meta style={styles.openingText}>Opening conversation…</Meta>
        </>
      )}
    </Animated.View>
  );
}

/** A conversation with no turns yet: the lane, quick calls and quick commands. */
export function Empty({
  lane,
  tint,
  reachable,
  busy,
  onPick,
  onQuickCall,
  onSignOut,
}: {
  lane: Lane;
  /** The mode colour — Auto, or the pinned lane. See Tint in theme.ts. */
  tint: Tint;
  /** False when the user pinned a lane that is not answering. */
  reachable: boolean;
  busy: boolean;
  onPick: (message: string) => void;
  onQuickCall: (favourite: Favourite) => void;
  onSignOut: () => void;
}) {
  const accent = laneColor(tint);
  const favourites = useFavourites();

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyContainer}>
      {/* Central Interactive AI Core */}
      <View style={styles.coreWrapper}>
        <IgrisLoader tint={tint} state={busy ? 'thinking' : 'idle'} size={110} breathe />
      </View>

      {/* Before lanes could be pinned, lane === 'local' implied the Mac had answered
          a probe. A pin breaks that: the lane is local because you said so, not
          because anything is listening. So "connected" has to check reachability,
          or it claims a live Mac in exactly the state the pin warning exists for. */}
      <Answer style={styles.emptyLede}>
        {lane === 'cloud'
          ? 'Operating via Render Cloud. System tools limited, answers may take ~30s.'
          : reachable
            ? 'Connected to the Mac. All system tools active.'
            : 'Pinned to the Mac, but it is not answering. Wake it, or switch lanes above.'}
      </Answer>

      {/* Quick call: favourites ring on one tap. Managed on /favourites. */}
      <View style={styles.openersSection}>
        <View style={[styles.sectionHead, favourites.length === 0 && styles.centred]}>
          <Meta style={styles.openersTitle}>QUICK CALL</Meta>
          {favourites.length > 0 ? (
            <PressableScale
              onPress={() => router.push('/favourites')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Manage quick-call contacts">
              <Meta style={[styles.sectionLink, { color: accent }]}>Edit</Meta>
            </PressableScale>
          ) : null}
        </View>
        <View style={styles.callChips}>
          {favourites.map((favourite) => (
            <PressableScale
              key={favourite.number}
              onPress={() => onQuickCall(favourite)}
              accessibilityRole="button"
              accessibilityLabel={`Call ${favourite.name}`}
              style={[styles.callChip, { borderColor: accent + '44' }]}>
              <View style={[styles.callChipAvatar, { backgroundColor: accent + '22' }]}>
                <Text style={[styles.callChipInitial, { color: accent }]}>
                  {favourite.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.callChipName} numberOfLines={1}>
                {favourite.alias ? capitalise(favourite.alias) : favourite.name.split(/\s+/)[0]}
              </Text>
            </PressableScale>
          ))}
          {favourites.length === 0 ? (
            <PressableScale
              onPress={() => router.push('/favourites')}
              accessibilityRole="button"
              style={[styles.callChip, styles.callChipAdd]}>
              <Plus size={14} color={Palette.muted} />
              <Text style={styles.callChipAddText}>Add people Igris can call instantly</Text>
            </PressableScale>
          ) : null}
        </View>
      </View>

      {/* Suggested Quick Openers */}
      <View style={styles.openersSection}>
        <Meta style={styles.openersTitle}>QUICK COMMANDS</Meta>
        <View style={styles.openersGrid}>
          {OPENERS.map((opener, idx) => {
            const IconComp = opener.icon;
            return (
              <Animated.View
                key={opener.text}
                entering={FadeInDown.delay(100 * idx).springify()}>
                <PressableScale
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onPick(opener.text);
                  }}
                  accessibilityRole="button"
                  style={styles.openerCard}>
                  <View style={[styles.openerIconBox, { backgroundColor: accent + '1E' }]}>
                    <IconComp size={15} color={accent} />
                  </View>
                  <Text style={styles.openerText}>{opener.text}</Text>
                </PressableScale>
              </Animated.View>
            );
          })}
        </View>
      </View>

      <PressableScale
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSignOut();
        }}
        accessibilityRole="button"
        style={styles.signOutButton}>
        <LogOut size={13} color={Palette.faint} />
        <Meta style={styles.signOutText}>Sign out session</Meta>
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  centred: { justifyContent: 'center' },
  sectionLink: {
    fontSize: 12,
    fontFamily: Font.uiMedium,
  },
  callChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Space.sm,
  },
  callChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingLeft: 6,
    paddingRight: Space.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: Palette.surface,
    maxWidth: '100%',
  },
  callChipAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callChipInitial: {
    fontFamily: Font.uiMedium,
    fontSize: 13,
  },
  callChipName: {
    color: Palette.text,
    fontFamily: Font.ui,
    fontSize: 14,
    flexShrink: 1,
  },
  callChipAdd: {
    borderColor: Palette.hairlineBright,
    borderStyle: 'dashed',
    paddingLeft: Space.md,
  },
  callChipAddText: {
    color: Palette.muted,
    fontFamily: Font.ui,
    fontSize: 13,
  },
  emptyContainer: {
    paddingHorizontal: Gutter,
    alignItems: 'center',
    paddingTop: Space.xl,
    gap: Space.xl,
  },
  openingContainer: {
    paddingHorizontal: Gutter,
    alignItems: 'center',
    paddingTop: Space.huge * 2,
    gap: Space.lg,
  },
  openingText: { color: Palette.muted, fontFamily: Font.ui },
  openingError: { color: Palette.alert, textAlign: 'center' },
  coreWrapper: {
    marginVertical: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyLede: {
    color: Palette.muted,
    textAlign: 'center',
    maxWidth: 340,
    fontSize: 15,
    lineHeight: 23,
  },
  openersSection: {
    width: '100%',
    gap: Space.sm,
    marginTop: Space.md,
  },
  openersTitle: {
    fontSize: 10,
    letterSpacing: 1.2,
    color: Palette.faint,
    textAlign: 'center',
  },
  openersGrid: {
    gap: Space.sm,
  },
  openerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: 16,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  openerIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openerText: {
    fontFamily: Font.ui,
    color: Palette.text,
    ...Type.ask,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.lg,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
  },
  signOutText: {
    color: Palette.faint,
  },
});

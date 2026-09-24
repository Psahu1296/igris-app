import * as Haptics from 'expo-haptics';
import { Check, Cloud, Radar, Zap } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Meta } from '@/components/typography';
import { Font, Gutter, Palette, Space, Type } from '@/constants/theme';
import type { Lane, LanePreference } from '@/lib/maestro';

/**
 * Which brain answers, chosen by hand.
 *
 * The lane was automatic until now — a health probe picked it and the badge only
 * re-ran the probe. That is right by default and wrong when you are debugging: you
 * may want Render specifically because the Mac is answering, or the Mac specifically
 * because you are testing tool reach. So the badge opens this, and a pinned lane
 * overrules the probe until it is set back to Auto.
 *
 * Anchored to the top-right under the header rather than measured against the badge.
 * A measured popover needs onLayout plus a ref and re-measures on rotation; the
 * header is a fixed height and the badge is always its last child, so the constant
 * lands in the same place for one line of code.
 */

const HEADER_DROP = 52;

type Row = {
  pref: LanePreference;
  label: string;
  hint: string;
  icon: typeof Zap;
  tint: string;
};

const ROWS: Row[] = [
  {
    pref: 'auto',
    label: 'Auto',
    hint: 'Use the Mac when it answers',
    icon: Radar,
    tint: Palette.auto,
  },
  {
    pref: 'local',
    label: 'Mac',
    hint: 'All tools · needs the tailnet',
    icon: Zap,
    tint: Palette.local,
  },
  {
    pref: 'cloud',
    label: 'Render',
    hint: 'Always up · fewer tools',
    icon: Cloud,
    tint: Palette.cloud,
  },
];

export function LaneMenu({
  visible,
  lane,
  lanePref,
  reachable,
  onChoose,
  onClose,
}: {
  visible: boolean;
  /** The lane actually in use, which is what Auto resolved to. */
  lane: Lane;
  lanePref: LanePreference;
  reachable: boolean;
  onChoose: (pref: LanePreference) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  const choose = (pref: LanePreference) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChoose(pref);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* The backdrop is the dismiss target, so a tap anywhere outside closes. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />

      <View style={[styles.card, { top: insets.top + HEADER_DROP }]}>
        {ROWS.map((row) => {
          const selected = lanePref === row.pref;
          const Icon = row.icon;
          const tint = row.tint;

          return (
            <Pressable
              key={row.pref}
              onPress={() => choose(row.pref)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${row.label}. ${row.hint}`}
              style={({ pressed }) => [
                styles.row,
                selected && styles.rowSelected,
                pressed && styles.rowPressed,
              ]}>
              <Icon size={14} color={tint} />

              <View style={styles.rowText}>
                <Meta style={[styles.label, selected && { color: tint }]}>
                  {row.label}
                  {row.pref === 'auto' && lanePref === 'auto'
                    ? ` · ${lane === 'local' ? 'Mac' : 'Render'}`
                    : ''}
                </Meta>
                <Meta style={styles.hint}>{row.hint}</Meta>
              </View>

              {selected ? <Check size={14} color={tint} /> : null}
            </Pressable>
          );
        })}

        {/* Only ever shown for a pin we are knowingly honouring against the evidence. */}
        {lanePref === 'local' && !reachable ? (
          <View style={styles.warning}>
            <Meta style={styles.warningText}>
              The Mac is not answering. Pinned anyway — turns will fail until it wakes.
            </Meta>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // absoluteFillObject was removed in RN 0.86, so the fill is spelled out.
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    position: 'absolute',
    right: Gutter,
    minWidth: 232,
    // Without a cap the warning line sets the width and the card grows leftward
    // across the whole header; capped, it wraps under the rows it belongs to.
    maxWidth: 280,
    borderRadius: 16,
    paddingVertical: Space.xs,
    backgroundColor: Palette.surfaceLift,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
    // Without elevation the card reads as part of the dimmed screen behind it.
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.md + 2,
    paddingVertical: Space.sm + 2,
  },
  rowSelected: { backgroundColor: Palette.surfaceGlass },
  rowPressed: { backgroundColor: Palette.surfaceGlassHover },
  rowText: { flex: 1, gap: 1 },
  label: { color: Palette.text, fontFamily: Font.uiMedium, ...Type.small },
  hint: { color: Palette.faint, fontFamily: Font.ui, ...Type.micro },
  warning: {
    paddingHorizontal: Space.md + 2,
    paddingTop: Space.sm,
    paddingBottom: Space.xs + 2,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
  },
  warningText: { color: Palette.alert, fontFamily: Font.ui, ...Type.micro },
});

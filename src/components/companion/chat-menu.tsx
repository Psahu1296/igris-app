import { ChevronRight, CircleDashed, Clapperboard, Radio, Trash2, UserRound, Volume2, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { BottomSheet } from '@/components/companion/bottom-sheet';
import { PressableScale } from '@/components/pressable-scale';
import { Meta } from '@/components/typography';
import { Font, Gutter, Palette, Space, Type } from '@/constants/theme';

/**
 * Her chat's settings, behind the header's ⋯ (2026-10-27): Live, Director, read aloud and
 * Clear used to sit as four buttons after her name, and her mood line was cut short.
 * `canSpeak` false hides the voice row (no voice model on the phone). Her page and her
 * stories are here too, so neither depends on knowing what a tap on her face does.
 */
export function ChatMenu({
  name,
  accent,
  live,
  directing,
  aloud,
  canSpeak,
  canClear,
  stories,
  onPage,
  onStories,
  onLive,
  onDirector,
  onAloud,
  onClear,
  onClose,
}: {
  name: string;
  accent: string;
  live: boolean;
  directing: boolean;
  aloud: boolean;
  canSpeak: boolean;
  canClear: boolean;
  stories: number;
  onPage: () => void;
  onStories: () => void;
  onLive: () => void;
  onDirector: () => void;
  onAloud: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet title={`Chat with ${name}`} onClose={onClose}>
      <View style={styles.list}>
        <Link icon={UserRound} accent={accent} label="Her page" hint="Mood, cycle, diary, memories, photos." onPress={onPage} />
        {stories > 0 ? (
          <Link icon={CircleDashed} accent={accent} label="Her stories" hint={stories === 1 ? '1 today' : `${stories} today`} onPress={onStories} />
        ) : null}
        <Row icon={Radio} accent={accent} label="Live photos" hint="A photo with every reply. Replies take longer." on={live} onToggle={onLive} />
        <Row icon={Clapperboard} accent={accent} label="Director" hint="The camera button lets you pick each part of her photo." on={directing} onToggle={onDirector} />
        {canSpeak ? (
          <Row icon={Volume2} accent={accent} label="Read her replies aloud" hint="On-device voice." on={aloud} onToggle={onAloud} />
        ) : null}
        {canClear ? (
          <PressableScale
            onPress={() => {
              onClose();
              onClear();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Clear everything with ${name}`}
            style={styles.clear}>
            <Trash2 size={16} color={Palette.alert} />
            <Text style={styles.clearText}>Clear the whole chat</Text>
          </PressableScale>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function Link({ icon: Icon, accent, label, hint, onPress }: {
  icon: LucideIcon;
  accent: string;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.row}>
      <Icon size={18} color={accent} />
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        <Meta>{hint}</Meta>
      </View>
      <ChevronRight size={18} color={Palette.muted} />
    </PressableScale>
  );
}

function Row({ icon: Icon, accent, label, hint, on, onToggle }: {
  icon: LucideIcon;
  accent: string;
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.row}>
      <Icon size={18} color={on ? accent : Palette.muted} />
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        <Meta>{hint}</Meta>
      </View>
      <Switch
        value={on}
        onValueChange={onToggle}
        trackColor={{ false: Palette.hairline, true: accent }}
        thumbColor={Palette.text}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Gutter, gap: Space.lg, paddingBottom: Space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  text: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontFamily: Font.uiMedium, color: Palette.text, ...Type.ask },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingTop: Space.lg,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
  },
  clearText: { fontFamily: Font.uiMedium, color: Palette.alert, ...Type.ask },
});

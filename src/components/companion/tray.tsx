import { BookHeart, Brain, Camera, Candy, Flame, Flower, Gem, Gift, ImagePlus, PawPrint, Shirt, SprayCan, type LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Font, Gutter, Palette, Space } from '@/constants/theme';
import { LEADS, MY_EMOTES, PACES, type CompanionDial, type CompanionGift, type CompanionOutfit, type CompanionScene } from '@/lib/companion';

/** Icon names the Mac may send for a gift (maestro companion/gifts.py `icon`); unknown → a gift box. */
const GIFT_ICONS: Record<string, LucideIcon> = { Candy, Flame, Flower, Gem, PawPrint, Shirt, SprayCan };

type Tab = 'actions' | 'scenes' | 'roleplay' | 'outfits' | 'gifts' | 'tonight' | 'more';
const TABS: { id: Tab; title: string }[] = [
  { id: 'actions', title: 'Actions' },
  { id: 'scenes', title: 'Scenes' },
  { id: 'roleplay', title: 'Roleplay' },
  { id: 'outfits', title: 'Outfits' },
  { id: 'gifts', title: 'Gifts' },
  { id: 'tonight', title: 'Tonight' },
  { id: 'more', title: 'More' },
];

/**
 * The tray above the message box, opened by the smile button: what he can do besides
 * typing, one row at a time. Actions: his own (*hugs you*), added to the draft. Scenes:
 * scene cards and games she opens. Roleplay: characters she plays until he stops — the Mac
 * lists only those the moment allows, those that suit her mood first. Outfits: what she
 * wears, which she puts on and shows, and a try-on of three looks.
 * Tonight: how he wants a scene to go and who leads. More: send her a photo, her memory,
 * her diary. The lists come from the Mac (empty on an older maestro).
 */
export function CompanionTray({
  scenes,
  outfits,
  gifts = [],
  dial,
  busy,
  accent,
  onEmote,
  onScene,
  onOutfit,
  onGift,
  onDial,
  onPhoto,
  onMemory,
  onDiary,
}: {
  scenes: CompanionScene[];
  outfits: CompanionOutfit[];
  /** What he can give her now; she reacts, keeps it, and wears what is to wear. */
  gifts?: CompanionGift[];
  dial: CompanionDial | null;
  /** She is answering: nothing that starts a turn can be tapped. */
  busy: boolean;
  accent: string;
  onEmote: (emote: string) => void;
  onScene: (scene: CompanionScene) => void;
  onOutfit: (outfit: CompanionOutfit) => void;
  onGift?: (gift: CompanionGift) => void;
  onDial: (dial: CompanionDial) => void;
  onPhoto: (source: 'camera' | 'library') => void;
  onMemory: () => void;
  onDiary: () => void;
}) {
  const [tab, setTab] = useState<Tab>('actions');
  const on = { backgroundColor: accent, borderColor: accent };
  const chip = (key: string, title: string, onPress: () => void, opts: { selected?: boolean; starts?: boolean; icon?: ReactNode; italic?: boolean } = {}) => (
    <PressableScale
      key={key}
      onPress={onPress}
      disabled={opts.starts && busy}
      accessibilityRole="button"
      accessibilityState={{ selected: !!opts.selected }}
      accessibilityLabel={title}
      style={[styles.chip, opts.icon ? styles.iconChip : null, opts.selected ? on : null, opts.starts && busy ? styles.off : null]}>
      {opts.icon}
      <Text style={[opts.italic ? styles.emoteText : styles.chipText, opts.selected ? styles.onText : null]}>{title}</Text>
    </PressableScale>
  );
  const roleplays = scenes.filter((scene) => scene.kind === 'roleplay');
  const pace = dial?.pace ?? 2;
  const lead = dial?.lead ?? 'switch';

  return (
    <View style={styles.tray}>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <PressableScale key={t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} hitSlop={6}>
            <Text style={[styles.tabText, tab === t.id ? { color: accent } : null]}>{t.title}</Text>
          </PressableScale>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={styles.row}>
        {tab === 'actions' ? MY_EMOTES.map((emote) => chip(emote, emote, () => onEmote(emote), { italic: true })) : null}
        {tab === 'scenes'
          ? scenes.filter((scene) => scene.kind !== 'roleplay').map((scene) => chip(scene.id, scene.title, () => onScene(scene), { starts: true }))
          : null}
        {tab === 'roleplay'
          ? roleplays.map((scene) => chip(scene.id, scene.title, () => onScene(scene), { starts: true }))
          : null}
        {tab === 'outfits' ? outfits.map((outfit) => chip(outfit.id, outfit.title, () => onOutfit(outfit), { starts: true })) : null}
        {tab === 'gifts'
          ? gifts.map((gift) => {
              const Icon = GIFT_ICONS[gift.icon] ?? Gift;
              return chip(gift.id, gift.label, () => onGift?.(gift), { starts: true, icon: <Icon size={14} color={accent} /> });
            })
          : null}
        {tab === 'tonight' ? (
          <>
            {PACES.map((title, i) => chip(`pace-${i}`, title, () => onDial({ pace: i, lead }), { selected: dial !== null && pace === i }))}
            <View style={styles.divider} />
            {LEADS.map((l) => chip(l.id, l.title, () => onDial({ pace, lead: l.id }), { selected: dial !== null && lead === l.id }))}
          </>
        ) : null}
        {tab === 'more' ? (
          <>
            {chip('library', 'Send a photo', () => onPhoto('library'), { starts: true, icon: <ImagePlus size={14} color={accent} /> })}
            {chip('camera', 'Camera', () => onPhoto('camera'), { starts: true, icon: <Camera size={14} color={accent} /> })}
            {chip('memory', 'Her memory', onMemory, { icon: <Brain size={14} color={accent} /> })}
            {chip('diary', 'Her diary', onDiary, { icon: <BookHeart size={14} color={accent} /> })}
          </>
        ) : null}
        {(tab === 'scenes' && scenes.length === 0) || (tab === 'outfits' && outfits.length === 0) || (tab === 'gifts' && gifts.length === 0) ? (
          <Text style={styles.none}>This needs a newer maestro on the Mac.</Text>
        ) : null}
        {tab === 'roleplay' && scenes.length > 0 && roleplays.length === 0 ? (
          <Text style={styles.none}>Not now — she is upset, or the mood is not there yet.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits on the message box like a keyboard's suggestion rows.
  tray: { borderTopWidth: 1, borderTopColor: Palette.hairline, paddingTop: Space.sm },
  tabs: { flexDirection: 'row', gap: Space.lg, paddingHorizontal: Gutter - 2 },
  tabText: { fontFamily: Font.ui, fontSize: 12, color: Palette.muted },
  row: { gap: Space.sm, paddingHorizontal: Gutter - 6, paddingVertical: Space.sm, alignItems: 'center' },
  chip: {
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  iconChip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  off: { opacity: 0.4 },
  chipText: { fontFamily: Font.ui, fontSize: 13, color: Palette.text },
  emoteText: { fontFamily: Font.voiceItalic, fontSize: 14, color: Palette.text },
  onText: { color: Palette.ground },
  divider: { width: 1, height: 18, backgroundColor: Palette.hairline },
  none: { fontFamily: Font.ui, fontSize: 12, color: Palette.faint },
});

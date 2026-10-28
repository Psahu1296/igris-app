import * as Haptics from 'expo-haptics';
import {
  BookHeart,
  Brain,
  Camera,
  Candy,
  Clapperboard,
  Flame,
  Flower,
  Gem,
  Gift,
  Hand,
  ImagePlus,
  PawPrint,
  Shirt,
  SprayCan,
  type LucideIcon,
} from 'lucide-react-native';
import { createElement, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Font, Gutter, Palette, Space, Type } from '@/constants/theme';
import {
  LEADS,
  MY_EMOTES,
  PACE_NOTES,
  PACES,
  type CompanionDial,
  type CompanionGift,
  type CompanionOutfit,
  type CompanionScene,
} from '@/lib/companion';

/** Icon names the Mac may send for a gift (maestro companion/gifts.py `icon`); unknown → a gift box. */
const GIFT_ICONS: Record<string, LucideIcon> = { Candy, Flame, Flower, Gem, PawPrint, Shirt, SprayCan };

type Tab = 'do' | 'play' | 'spoil' | 'tonight' | 'share';
/** Five tabs by what he wants to do; each says in one line what it is for. */
const TABS: { id: Tab; title: string; icon: LucideIcon; hint: string }[] = [
  { id: 'do', title: 'Do', icon: Hand, hint: 'Adds an action to the message you are writing' },
  { id: 'play', title: 'Play', icon: Clapperboard, hint: 'Start something together — she sets it up and plays along' },
  { id: 'spoil', title: 'Spoil', icon: Gift, hint: 'Give her something, or pick what she wears (she shows you)' },
  { id: 'tonight', title: 'Tonight', icon: Flame, hint: 'How tonight goes, and who leads — she follows it' },
  { id: 'share', title: 'Share', icon: Camera, hint: 'Send her a photo, or look at what she keeps' },
];
type Kind = CompanionScene['kind'];
const KINDS: { id: Kind; title: string }[] = [
  { id: 'scene', title: 'Moments' },
  { id: 'game', title: 'Games' },
  { id: 'roleplay', title: 'Roleplay' },
];

/**
 * The tray above the message box, opened by the smile button. Five tabs by intent — Do (an
 * action in his message), Play (moments, games, roleplay), Spoil (gifts, outfits), Tonight
 * (the dial), Share (photos, her memory and diary) — and every card says what it does (`about`
 * from the Mac; the words are the Mac's, the app only lays them out). What starts a turn is
 * dimmed while she answers. The lists come from the Mac and follow the moment (maestro
 * scenes.offered, gifts.offered), so what is here is what fits now.
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
  const [tab, setTab] = useState<Tab>('play');
  const offered = KINDS.filter((k) => scenes.some((s) => s.kind === k.id));
  const [kind, setKind] = useState<Kind>('scene');
  const showing = offered.some((k) => k.id === kind) ? kind : (offered[0]?.id ?? 'scene');
  const pace = dial?.pace ?? 2;
  const lead = dial?.lead ?? 'switch';
  const here = TABS.find((t) => t.id === tab) ?? TABS[0];

  const tap = (fn: () => void) => () => {
    void Haptics.selectionAsync();
    fn();
  };

  return (
    <View style={styles.tray}>
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <PressableScale
              key={t.id}
              onPress={() => setTab(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              hitSlop={4}
              style={[styles.tab, on && { backgroundColor: 'rgba(251, 113, 133, 0.14)' }]}>
              {createElement(t.icon, { size: 16, color: on ? accent : Palette.muted })}
              <Text style={[styles.tabText, on && { color: accent }]}>{t.title}</Text>
            </PressableScale>
          );
        })}
      </View>
      <Text style={styles.hint}>{here.hint}</Text>

      {tab === 'do' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {MY_EMOTES.map((emote) => (
            <PressableScale key={emote} onPress={tap(() => onEmote(emote))} accessibilityRole="button" style={styles.chip}>
              <Text style={styles.emoteText}>*{emote}*</Text>
            </PressableScale>
          ))}
        </ScrollView>
      ) : null}

      {tab === 'play' ? (
        <>
          {offered.length > 1 ? (
            <View style={styles.pills}>
              {offered.map((k) => (
                <PressableScale
                  key={k.id}
                  onPress={() => setKind(k.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: showing === k.id }}
                  style={[styles.pill, showing === k.id && { borderColor: accent }]}>
                  <Text style={[styles.pillText, showing === k.id && { color: accent }]}>{k.title}</Text>
                </PressableScale>
              ))}
            </View>
          ) : null}
          <Cards busy={busy}>
            {scenes
              .filter((s) => s.kind === showing)
              .map((s) => (
                <Card key={s.id} busy={busy} lead={s.emoji ?? '✨'} title={s.title} about={s.about} onPress={tap(() => onScene(s))} />
              ))}
          </Cards>
          {scenes.length === 0 ? <Text style={styles.empty}>Nothing to start right now.</Text> : null}
        </>
      ) : null}

      {tab === 'spoil' ? (
        <Cards busy={busy}>
          {gifts.map((g) => (
            <Card
              key={g.id}
              busy={busy}
              lead={createElement(GIFT_ICONS[g.icon] ?? Gift, { size: 20, color: accent })}
              title={g.label}
              about={g.about}
              onPress={tap(() => onGift?.(g))}
            />
          ))}
          {outfits.map((o) => (
            <Card key={o.id} busy={busy} lead={createElement(Shirt, { size: 20, color: accent })} title={o.title} about={o.about} onPress={tap(() => onOutfit(o))} />
          ))}
        </Cards>
      ) : null}

      {tab === 'tonight' ? (
        <View style={styles.dial}>
          <View style={styles.paceRow}>
            {PACES.map((title, i) => {
              const on = dial !== null && pace === i;
              return (
                <PressableScale
                  key={title}
                  onPress={tap(() => onDial({ pace: i, lead }))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${title}: ${PACE_NOTES[i]}`}
                  style={[styles.paceStep, { opacity: 0.45 + i * 0.13 }, on && { backgroundColor: accent, opacity: 1 }]}>
                  <Text style={[styles.paceText, on && styles.onText]}>{title}</Text>
                </PressableScale>
              );
            })}
          </View>
          <Text style={styles.dialNote}>{dial ? PACE_NOTES[pace] : 'Not set: she goes by the moment.'}</Text>
          <View style={styles.leadRow}>
            {LEADS.map((l) => {
              const on = dial !== null && lead === l.id;
              return (
                <PressableScale
                  key={l.id}
                  onPress={tap(() => onDial({ pace, lead: l.id }))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.lead, on && { borderColor: accent, backgroundColor: 'rgba(251, 113, 133, 0.14)' }]}>
                  <Text style={[styles.pillText, on && { color: accent }]}>{l.title}</Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ) : null}

      {tab === 'share' ? (
        <Cards busy={busy}>
          <Card busy={busy} lead={createElement(ImagePlus, { size: 20, color: accent })} title="Send a photo" about="She sees it and answers it" onPress={tap(() => onPhoto('library'))} />
          <Card busy={busy} lead={createElement(Camera, { size: 20, color: accent })} title="Camera" about="Take one now and send it" onPress={tap(() => onPhoto('camera'))} />
          <Card busy={false} lead={createElement(Brain, { size: 20, color: accent })} title="Her memory" about="What she remembers about you two" onPress={tap(onMemory)} />
          <Card busy={false} lead={createElement(BookHeart, { size: 20, color: accent })} title="Her diary" about="What she wrote at night" onPress={tap(onDiary)} />
        </Cards>
      ) : null}
    </View>
  );
}

function Cards({ children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {children}
    </ScrollView>
  );
}

/** One thing he can do: what it is, and in two lines what happens. */
function Card({ lead, title, about, busy, onPress }: { lead: React.ReactNode; title: string; about?: string; busy: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityLabel={about ? `${title}. ${about}` : title} style={[styles.card, busy && styles.off]}>
      <View style={styles.cardLead}>{typeof lead === 'string' ? <Text style={styles.emoji}>{lead}</Text> : lead}</View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {title}
      </Text>
      {about ? (
        <Text style={styles.cardAbout} numberOfLines={2}>
          {about}
        </Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tray: {
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
    borderTopWidth: 1,
    borderTopColor: Palette.hairline,
    backgroundColor: Palette.ground,
    gap: Space.sm,
  },
  tabs: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Gutter - 6 },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 6, borderRadius: 12 },
  tabText: { fontFamily: Font.uiMedium, color: Palette.muted, ...Type.micro },
  hint: { paddingHorizontal: Gutter, fontFamily: Font.ui, color: Palette.faint, ...Type.micro },
  row: { gap: Space.sm, paddingHorizontal: Gutter },
  pills: { flexDirection: 'row', gap: Space.sm, paddingHorizontal: Gutter },
  pill: {
    paddingHorizontal: Space.md,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  pillText: { fontFamily: Font.uiMedium, color: Palette.muted, ...Type.small },
  chip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.surfaceGlass,
  },
  emoteText: { fontFamily: Font.voiceItalic, color: Palette.text, ...Type.ask },
  card: {
    width: 148,
    padding: Space.md,
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.surface,
  },
  cardLead: { height: 26, justifyContent: 'center' },
  emoji: { fontSize: 22, lineHeight: 26 },
  cardTitle: { fontFamily: Font.uiMedium, color: Palette.text, ...Type.small },
  cardAbout: { fontFamily: Font.ui, color: Palette.muted, ...Type.micro },
  off: { opacity: 0.4 },
  empty: { paddingHorizontal: Gutter, fontFamily: Font.ui, color: Palette.faint, ...Type.small },
  dial: { paddingHorizontal: Gutter, gap: Space.sm },
  paceRow: { flexDirection: 'row', gap: 4 },
  paceStep: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Space.sm,
    borderRadius: 10,
    backgroundColor: 'rgba(251, 113, 133, 0.22)',
  },
  paceText: { fontFamily: Font.uiMedium, color: Palette.text, ...Type.micro },
  onText: { color: Palette.ground },
  dialNote: { fontFamily: Font.voiceItalic, color: Palette.muted, ...Type.small },
  leadRow: { flexDirection: 'row', gap: Space.sm },
  lead: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Space.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
});

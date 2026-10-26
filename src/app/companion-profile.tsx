import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  BookHeart,
  Brain,
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Flame,
  Flower2,
  Heart,
  Images,
  MapPin,
  Moon,
  Quote,
  Smile,
  Sparkles,
  Sprout,
  type LucideIcon,
} from 'lucide-react-native';
import { createElement, useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { DiarySheet } from '@/components/companion/diary-sheet';
import { MemorySheet } from '@/components/companion/memory-sheet';
import { PhotoViewer } from '@/components/photo-viewer';
import { PressableScale } from '@/components/pressable-scale';
import { TypingIndicator } from '@/components/typing-indicator';
import { Meta, Title } from '@/components/typography';
import { Font, Gutter, Palette, Space, Type } from '@/constants/theme';
import {
  deleteMessage,
  fetchPhotos,
  fetchProfile,
  likeMessage,
  makeTrainingSet,
  ROSE,
  ROSE_SOFT,
  type CompanionProfile,
  type ProfileCard,
  type ProfilePhoto,
} from '@/lib/companion';
import { drawnSource, type Lane } from '@/lib/maestro';
import { useSession } from '@/state/session';

type Source = { uri: string; headers: Record<string, string> };

/** Her second colour: the warm end of every gradient on her page. */
const PEACH = '#FDBA74';

// The Mac names an icon by a generic id (maestro companion/page.py ICONS); the app owns the
// drawing. An id this build does not know falls back to a heart, so a newer maestro never
// breaks an older app.
const ICONS: Record<string, LucideIcon> = {
  smile: Smile,
  flame: Flame,
  moon: Moon,
  cloud: CloudRain,
  heart: Heart,
  sparkles: Sparkles,
  flower: Flower2,
  sprout: Sprout,
  quote: Quote,
  calendar: CalendarHeart,
  book: BookHeart,
  brain: Brain,
  'map-pin': MapPin,
};
/** The icon the Mac named, drawn by a component that stays the same between renders. */
function Glyph({ id, size, color }: { id?: string; size: number; color: string }) {
  return createElement((id && ICONS[id]) || Heart, { size, color });
}

/**
 * Her page, opened from her photo in the chat header. Everything on it comes from the Mac
 * (maestro GET /companion/profile): labelled cards this screen only knows the kinds of, with
 * an icon id and a section each, a link to her diary and her memory (the chat's own sheets),
 * and every photo she sent — a heart keeps one for a later retrain of her face model, delete
 * removes it for good (the same heart and delete as in the chat).
 */
export default function CompanionProfileScreen() {
  const { lane } = useSession();
  const [profile, setProfile] = useState<CompanionProfile | null>(null);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'diary' | 'memory' | null>(null);
  const [open, setOpen] = useState<Source | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([fetchProfile(lane), fetchPhotos(lane)])
      .then(([p, page]) => {
        if (!live) return;
        setProfile(p);
        setPhotos(page.photos);
        setMore(page.more);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [lane]);

  const loadMore = useCallback(() => {
    const last = photos[photos.length - 1];
    if (!more || !last) return;
    setMore(false); // one page at a time
    fetchPhotos(lane, last.at)
      .then((page) => {
        setPhotos((now) => [...now, ...page.photos]);
        setMore(page.more);
      })
      .catch(() => setMore(true));
  }, [lane, more, photos]);

  const heart = async (photo: ProfilePhoto) => {
    try {
      const liked = await likeMessage(lane, photo.at, !photo.liked);
      setPhotos((now) => now.map((p) => ({ ...p, liked: liked.includes(p.at) })));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {
      ToastAndroid.show(e instanceof Error ? e.message : String(e), ToastAndroid.SHORT);
    }
  };

  const remove = (photo: ProfilePhoto) =>
    Alert.alert('Delete this photo?', 'It is gone from the chat and the Mac, and never used for training.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteMessage(lane, photo.at)
            .then(() => setPhotos((now) => now.filter((p) => p.at !== photo.at)))
            .catch((e: unknown) => ToastAndroid.show(e instanceof Error ? e.message : String(e), ToastAndroid.SHORT)),
      },
    ]);

  const actions = (photo: ProfilePhoto) =>
    Alert.alert('This photo', undefined, [
      { text: photo.liked ? 'Remove heart' : 'Heart it', onPress: () => void heart(photo) },
      { text: 'Delete', style: 'destructive', onPress: () => remove(photo) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const training = () =>
    makeTrainingSet(lane)
      .then((n) => ToastAndroid.show(n ? `${n} hearted photos copied for training.` : 'Heart some photos first.', ToastAndroid.SHORT))
      .catch((e: unknown) => ToastAndroid.show(e instanceof Error ? e.message : String(e), ToastAndroid.SHORT));

  // The mood card is the hero's chip, not a card of its own.
  const mood = profile?.cards.find((c) => c.kind === 'text' && c.title === 'Mood');
  const rest = profile?.cards.filter((c) => c !== mood) ?? [];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <PressableScale onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={styles.iconButton}>
          <ChevronLeft size={18} color={Palette.text} />
        </PressableScale>
      </View>
      {error ? (
        <Meta style={styles.centered}>{error}</Meta>
      ) : !profile ? (
        <View style={styles.centered}>
          <TypingIndicator color={ROSE} />
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(p) => p.at}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.content}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <View style={styles.top}>
              <Hero lane={lane} profile={profile} mood={mood} onOpen={setOpen} />
              <Sections cards={rest} />
              <View style={styles.links}>
                {profile.links.map((link) => {
                  return (
                    <PressableScale key={link.id} onPress={() => setSheet(link.id)} accessibilityRole="button" style={styles.link}>
                      <Badge id={link.icon ?? (link.id === 'diary' ? 'book' : 'brain')} />
                      <Text style={styles.linkText} numberOfLines={2}>
                        {link.title}
                      </Text>
                      <ChevronRight size={16} color={Palette.muted} />
                    </PressableScale>
                  );
                })}
              </View>
              <View style={styles.photosHead}>
                <View style={styles.sectionTitleRow}>
                  <Images size={14} color={ROSE} />
                  <Text style={styles.sectionTitle}>PHOTOS</Text>
                </View>
                <PressableScale onPress={training} accessibilityRole="button" accessibilityLabel="Copy hearted photos for training" style={styles.trainButton}>
                  <Sparkles size={13} color={PEACH} />
                  <Text style={styles.trainText}>Training set</Text>
                </PressableScale>
              </View>
              <Meta style={styles.hint}>Tap to open · hold to heart or delete</Meta>
            </View>
          }
          ListEmptyComponent={<Meta style={styles.emptyPhotos}>No photos yet.</Meta>}
          renderItem={({ item }) => <Tile lane={lane} photo={item} onOpen={setOpen} onHold={() => actions(item)} />}
        />
      )}
      <PhotoViewer source={open} onClose={() => setOpen(null)} />
      {sheet === 'diary' && profile ? <DiarySheet lane={lane} name={profile.name} accent={ROSE} onClose={() => setSheet(null)} /> : null}
      {sheet === 'memory' && profile ? <MemorySheet lane={lane} name={profile.name} accent={ROSE} onClose={() => setSheet(null)} /> : null}
    </SafeAreaView>
  );
}

function useDrawn(lane: Lane, name: string | null): Source | null {
  const [source, setSource] = useState<Source | null>(null);
  useEffect(() => {
    if (!name) return;
    let live = true;
    drawnSource(lane, name)
      .then((s) => live && setSource(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [lane, name]);
  return source;
}

const FACE = 116;
const HALO = FACE + 16;

/** Her face inside a rose-to-peach ring with a soft glow, her name, where she is and her mood. */
function Hero({ lane, profile, mood, onOpen }: { lane: Lane; profile: CompanionProfile; mood?: ProfileCard; onOpen: (s: Source) => void }) {
  const face = useDrawn(lane, profile.face);
  return (
    <View style={styles.hero}>
      <View style={styles.glow} />
      <View style={styles.halo}>
        <Svg width={HALO} height={HALO} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="halo" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={ROSE} />
              <Stop offset="1" stopColor={PEACH} />
            </LinearGradient>
          </Defs>
          <Circle cx={HALO / 2} cy={HALO / 2} r={HALO / 2 - 2} stroke="url(#halo)" strokeWidth={3} fill="none" />
        </Svg>
        <Pressable onPress={() => face && onOpen(face)} accessibilityRole="imagebutton" accessibilityLabel="Her photo, full screen" style={styles.face}>
          {face ? <Image source={face} style={styles.fill} contentFit="cover" /> : <Heart size={32} color={ROSE} fill={ROSE} />}
        </Pressable>
      </View>
      <Title style={styles.heroName}>
        {profile.name}
        <Text style={styles.heroAge}>, {profile.age}</Text>
      </Title>
      <View style={styles.chips}>
        {profile.now ? (
          <View style={styles.chip}>
            <MapPin size={12} color={Palette.muted} />
            <Text style={styles.chipText} numberOfLines={1}>
              {profile.now}
            </Text>
          </View>
        ) : null}
        {mood && mood.kind === 'text' ? (
          <View style={[styles.chip, styles.moodChip]}>
            <Glyph id={mood.icon} size={12} color={ROSE} />
            <Text style={[styles.chipText, { color: Palette.text }]}>{mood.value}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Cards grouped under their section headings, in the order the Mac sent them. */
function Sections({ cards }: { cards: ProfileCard[] }) {
  const groups: { title: string; cards: ProfileCard[] }[] = [];
  for (const card of cards) {
    const title = card.section ?? '';
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.cards.push(card);
    else groups.push({ title, cards: [card] });
  }
  return (
    <View style={styles.sections}>
      {groups.map((group) => (
        <View key={group.title || 'cards'} style={styles.section}>
          {group.title ? <Text style={styles.sectionTitle}>{group.title.toUpperCase()}</Text> : null}
          <View style={styles.cards}>
            {group.cards.map((card) => (
              <Card key={card.title} card={card} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function Badge({ id, size = 34 }: { id?: string; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Glyph id={id} size={size * 0.5} color={ROSE} />
    </View>
  );
}

/** A thin rose-to-peach bar: how far along `value` (0–1) is. */
function Bar({ value }: { value: number }) {
  const share = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.track}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={ROSE} />
            <Stop offset="1" stopColor={PEACH} />
          </LinearGradient>
        </Defs>
        {share > 0 ? <Rect x="0" y="0" width={`${share * 100}%`} height="100%" rx={3} fill="url(#bar)" /> : null}
      </Svg>
    </View>
  );
}

const RING = 92;
const STROKE = 9;

/** A progress ring: `value` of `max`, the number in the middle. */
function Ring({ value, max }: { value: number; max: number }) {
  const r = (RING - STROKE) / 2;
  const length = 2 * Math.PI * r;
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={styles.ring}>
      <Svg width={RING} height={RING}>
        <Defs>
          <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={ROSE} />
            <Stop offset="1" stopColor={PEACH} />
          </LinearGradient>
        </Defs>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={Palette.surfaceGlassHover} strokeWidth={STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke="url(#ring)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${length * share} ${length}`}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringValue}>{value}</Text>
        <Meta style={styles.ringMax}>of {max}</Meta>
      </View>
    </View>
  );
}

/** One card, drawn by its kind; the words and the icon id are the Mac's. */
function Card({ card }: { card: ProfileCard }) {
  if (card.kind === 'meter') {
    return (
      <View style={[styles.card, styles.half]}>
        <View style={styles.cardTop}>
          <Badge id={card.icon} size={30} />
          <Text style={styles.percent}>{Math.round(Math.max(0, Math.min(1, card.value)) * 100)}%</Text>
        </View>
        <Meta numberOfLines={1}>{card.title}</Meta>
        <Bar value={card.value} />
        {card.caption ? <Meta style={styles.caption}>{card.caption}</Meta> : null}
      </View>
    );
  }
  if (card.kind === 'stat') {
    return (
      <View style={[styles.card, styles.half]}>
        <Badge id={card.icon} size={30} />
        <Text style={styles.statValue}>{card.value}</Text>
        <Meta numberOfLines={1}>{card.title}</Meta>
        {card.caption ? <Meta style={styles.caption}>{card.caption}</Meta> : null}
      </View>
    );
  }
  if (card.kind === 'ring') {
    return (
      <View style={[styles.card, styles.full, styles.ringCard]}>
        <Ring value={card.value} max={card.max} />
        <View style={styles.ringText}>
          <View style={styles.cardTitleRow}>
            <Glyph id={card.icon} size={15} color={ROSE} />
            <Text style={styles.cardTitle}>{card.title}</Text>
          </View>
          {card.caption
            ? card.caption.split(' · ').map((part, i) => (
                <Text key={part} style={i === 0 ? styles.ringPhase : styles.ringNote}>
                  {part}
                </Text>
              ))
            : null}
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.card, styles.full, styles.quoteCard]}>
      <View style={styles.cardTitleRow}>
        <Glyph id={card.icon} size={15} color={ROSE} />
        <Text style={styles.cardTitle}>{card.title}</Text>
      </View>
      <Text style={styles.quoteText}>{card.value}</Text>
    </View>
  );
}

function Tile({ lane, photo, onOpen, onHold }: { lane: Lane; photo: ProfilePhoto; onOpen: (s: Source) => void; onHold: () => void }) {
  const source = useDrawn(lane, photo.name);
  return (
    <Pressable
      onPress={() => source && onOpen(source)}
      onLongPress={onHold}
      accessibilityRole="imagebutton"
      accessibilityLabel={photo.liked ? 'Hearted photo' : 'Photo'}
      style={styles.tile}>
      {source ? <Image source={source} style={styles.fill} contentFit="cover" transition={200} /> : null}
      {photo.liked ? (
        <View style={styles.tileHeart}>
          <Heart size={11} color={ROSE} fill={ROSE} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  fill: { width: '100%', height: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Gutter, paddingVertical: Space.sm },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceGlass,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Gutter, textAlign: 'center' },
  content: { paddingHorizontal: Gutter, paddingBottom: Space.huge },
  top: { gap: Space.xl, paddingBottom: Space.sm },

  hero: { alignItems: 'center', gap: Space.sm },
  glow: {
    position: 'absolute',
    top: -30,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: ROSE_SOFT,
    opacity: 0.6,
  },
  halo: { width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center' },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surface,
  },
  heroName: { marginTop: Space.xs },
  heroAge: { fontFamily: Font.voice, color: Palette.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
    maxWidth: '100%',
  },
  moodChip: { backgroundColor: ROSE_SOFT, borderColor: 'rgba(251, 113, 133, 0.3)' },
  chipText: { fontFamily: Font.uiMedium, color: Palette.muted, ...Type.small, flexShrink: 1 },

  sections: { gap: Space.xl },
  section: { gap: Space.sm },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  sectionTitle: { fontFamily: Font.uiMedium, color: Palette.faint, ...Type.micro, letterSpacing: 1.6 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  card: {
    backgroundColor: Palette.surface,
    borderRadius: 18,
    padding: Space.md,
    gap: 6,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  half: { width: '48.5%' },
  full: { width: '100%' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  cardTitle: { fontFamily: Font.uiMedium, color: Palette.muted, ...Type.small },
  badge: { alignItems: 'center', justifyContent: 'center', backgroundColor: ROSE_SOFT },
  percent: { fontFamily: Font.voiceMedium, color: Palette.text, ...Type.ask },
  track: { height: 6, borderRadius: 3, backgroundColor: Palette.surfaceGlassHover, overflow: 'hidden' },
  caption: { ...Type.micro },
  statValue: { fontFamily: Font.voiceMedium, color: Palette.text, fontSize: 30, lineHeight: 36, marginTop: Space.xs },

  ringCard: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringValue: { fontFamily: Font.voiceMedium, color: Palette.text, fontSize: 26, lineHeight: 30 },
  ringMax: { ...Type.micro },
  ringText: { flex: 1, gap: 4 },
  ringPhase: { fontFamily: Font.voiceMedium, color: Palette.text, ...Type.ask },
  ringNote: { fontFamily: Font.ui, color: Palette.muted, ...Type.small },

  quoteCard: { borderLeftWidth: 3, borderLeftColor: ROSE, gap: Space.sm },
  quoteText: { fontFamily: Font.voiceItalic, color: Palette.text, ...Type.ask },

  links: { flexDirection: 'row', gap: Space.sm },
  link: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.md,
    borderRadius: 18,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  linkText: { flex: 1, fontFamily: Font.uiMedium, color: Palette.text, ...Type.small },

  photosHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: Space.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(253, 186, 116, 0.35)',
  },
  trainText: { fontFamily: Font.uiMedium, color: PEACH, ...Type.micro },
  hint: { marginTop: -Space.md, ...Type.micro },
  gridRow: { gap: Space.xs, marginBottom: Space.xs },
  tile: { flex: 1 / 3, aspectRatio: 768 / 960, borderRadius: 10, overflow: 'hidden', backgroundColor: Palette.surface },
  tileHeart: { position: 'absolute', top: 6, right: 6, padding: 4, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  emptyPhotos: { paddingVertical: Space.xl, textAlign: 'center' },
});

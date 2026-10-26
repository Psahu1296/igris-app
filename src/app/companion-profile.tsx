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
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { createElement, useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

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
/** Subtle warm champagne gold highlight for top-tier accents. */
const GOLD_WARM = '#FFDF9E';

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
  const [selectedPhoto, setSelectedPhoto] = useState<ProfilePhoto | null>(null);
  // All of her photos (the Mac's count), not the pages loaded so far.
  const [total, setTotal] = useState<number | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([fetchProfile(lane), fetchPhotos(lane)])
      .then(([p, page]) => {
        if (!live) return;
        setProfile(p);
        setPhotos(page.photos);
        setMore(page.more);
        setTotal(page.total ?? null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [lane, reloadKey]);

  const retry = useCallback(() => {
    setProfile(null);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

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
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
            .then(() => {
              setPhotos((now) => now.filter((p) => p.at !== photo.at));
              setTotal((n) => (n === null ? n : Math.max(0, n - 1)));
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            })
            .catch((e: unknown) => ToastAndroid.show(e instanceof Error ? e.message : String(e), ToastAndroid.SHORT)),
      },
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
      {/* Luminous ambient top glow radiating behind header & hero */}
      <View style={styles.ambientGlow} pointerEvents="none">
        <Svg width="100%" height={320}>
          <Defs>
            <RadialGradient id="topGlow" cx="50%" cy="30%" r="55%">
              <Stop offset="0%" stopColor={ROSE} stopOpacity={0.16} />
              <Stop offset="50%" stopColor={PEACH} stopOpacity={0.06} />
              <Stop offset="100%" stopColor={Palette.ground} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height={320} fill="url(#topGlow)" />
        </Svg>
      </View>

      <View style={styles.header}>
        <PressableScale
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backButton}>
          <ChevronLeft size={18} color={Palette.text} />
        </PressableScale>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>COMPANION PROFILE</Text>
        </View>

        <View style={styles.headerRight}>
          {/* Her real presence (maestro presence.py): grey while she is busy, rose when she is here. */}
          <View
            style={[styles.presenceDot, profile?.away ? styles.presenceAway : null]}
            accessible
            accessibilityLabel={profile?.away ? `Busy: ${profile.away.reason}` : 'Here'}
          />
        </View>
      </View>

      {error ? (
        <View style={styles.centered}>
          <View style={styles.errorCard}>
            <Meta style={styles.errorText}>{error}</Meta>
            <PressableScale onPress={retry} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </PressableScale>
          </View>
        </View>
      ) : !profile ? (
        <View style={styles.centered}>
          <View style={styles.loadingPulse}>
            <Svg width={80} height={80}>
              <Defs>
                <LinearGradient id="loadingHalo" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0%" stopColor={ROSE} />
                  <Stop offset="100%" stopColor={PEACH} />
                </LinearGradient>
              </Defs>
              <Circle cx={40} cy={40} r={36} stroke="url(#loadingHalo)" strokeWidth={2} fill="none" opacity={0.5} />
            </Svg>
            <View style={styles.loadingInner}>
              <Heart size={24} color={ROSE} fill={ROSE} />
            </View>
          </View>
          <TypingIndicator color={ROSE} />
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(p) => p.at}
          numColumns={3}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <View style={styles.top}>
              <Hero lane={lane} profile={profile} mood={mood} onOpen={setOpen} />

              {/* Diary and memory links */}
              {profile.links.length > 0 ? (
                <View style={styles.links}>
                  {profile.links.map((link) => {
                    const isDiary = link.id === 'diary';
                    return (
                      <PressableScale
                        key={link.id}
                        onPress={() => {
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSheet(link.id);
                        }}
                        accessibilityRole="button"
                        style={styles.linkCard}>
                        <View style={styles.linkCardHeader}>
                          <View style={styles.linkBadge}>
                            <Glyph id={link.icon ?? (isDiary ? 'book' : 'brain')} size={15} color={ROSE} />
                          </View>
                          <ChevronRight size={14} color={Palette.muted} />
                        </View>
                        <Text style={styles.linkTitle} numberOfLines={1}>
                          {link.title}
                        </Text>
                        <Text style={styles.linkSubtitle} numberOfLines={1}>
                          {isDiary ? 'Private thoughts & notes' : 'Shared memories'}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              ) : null}

              <Sections cards={rest} />

              <View style={styles.photosHead}>
                <View style={styles.photosTitleRow}>
                  <Images size={15} color={ROSE} />
                  <Text style={styles.sectionHeaderTitle}>PHOTOS</Text>
                  {(total ?? photos.length) > 0 ? (
                    <View style={styles.photoCountPill}>
                      <Text style={styles.photoCountText}>{total ?? photos.length}</Text>
                    </View>
                  ) : null}
                </View>
                <PressableScale
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    training();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Copy hearted photos for training"
                  style={styles.trainButton}>
                  <Sparkles size={12} color={PEACH} />
                  <Text style={styles.trainText}>Training set</Text>
                </PressableScale>
              </View>
              <Text style={styles.photosHint}>Tap to view · Hold to heart or delete</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyPhotosContainer}>
              <View style={styles.emptyPhotosIconWrap}>
                <Images size={26} color={Palette.muted} />
              </View>
              <Text style={styles.emptyPhotosTitle}>No captured moments yet</Text>
              <Meta style={styles.emptyPhotosSubtitle}>Photos she shares in your conversations will appear here.</Meta>
            </View>
          }
          renderItem={({ item }) => (
            <Tile
              lane={lane}
              photo={item}
              onOpen={setOpen}
              onHold={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSelectedPhoto(item);
              }}
            />
          )}
        />
      )}

      {/* Full-screen Photo Viewer */}
      <PhotoViewer source={open} onClose={() => setOpen(null)} />

      {/* Polished Photo Actions Sheet */}
      <PhotoActionModal
        photo={selectedPhoto}
        lane={lane}
        onClose={() => setSelectedPhoto(null)}
        onHeart={() => {
          if (selectedPhoto) {
            void heart(selectedPhoto);
            setSelectedPhoto(null);
          }
        }}
        onDelete={() => {
          if (selectedPhoto) {
            const toDelete = selectedPhoto;
            setSelectedPhoto(null);
            remove(toDelete);
          }
        }}
      />

      {/* Diary & memory sheets */}
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

const FACE = 118;
const HALO = FACE + 20;

/** Her face inside a rose-peach-gold glowing ring, her name, where she is and her mood. */
function Hero({ lane, profile, mood, onOpen }: { lane: Lane; profile: CompanionProfile; mood?: ProfileCard; onOpen: (s: Source) => void }) {
  const face = useDrawn(lane, profile.face);
  return (
    <View style={styles.hero}>
      <View style={styles.haloWrap}>
        <Svg width={HALO} height={HALO} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="haloGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={ROSE} />
              <Stop offset="65%" stopColor={PEACH} />
              <Stop offset="100%" stopColor={GOLD_WARM} />
            </LinearGradient>
          </Defs>
          {/* Faint ambient outer ring */}
          <Circle cx={HALO / 2} cy={HALO / 2} r={HALO / 2 - 1} stroke={ROSE} strokeWidth={1} opacity={0.25} fill="none" />
          {/* Luminous multi-stop gradient halo */}
          <Circle
            cx={HALO / 2}
            cy={HALO / 2}
            r={HALO / 2 - 4}
            stroke="url(#haloGrad)"
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
          {/* Inner dark separator border */}
          <Circle cx={HALO / 2} cy={HALO / 2} r={HALO / 2 - 7} stroke={Palette.ground} strokeWidth={2} fill="none" />
        </Svg>

        <PressableScale
          onPress={() => {
            if (face) {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onOpen(face);
            }
          }}
          accessibilityRole="imagebutton"
          accessibilityLabel="Her photo, full screen"
          style={styles.face}>
          {face ? (
            <Image source={face} style={styles.fill} contentFit="cover" transition={200} />
          ) : (
            <Heart size={32} color={ROSE} fill={ROSE} />
          )}
        </PressableScale>

        {/* Ethereal presence jewel badge */}
        <View style={styles.haloJewel}>
          <Sparkles size={11} color="#FFFFFF" />
        </View>
      </View>

      <Title style={styles.heroName}>
        {profile.name}
        <Text style={styles.heroAge}> · {profile.age}</Text>
      </Title>

      <View style={styles.chips}>
        {profile.now ? (
          <View style={styles.chip}>
            <MapPin size={12} color={PEACH} />
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
          {group.title ? (
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderTitle}>{group.title.toUpperCase()}</Text>
              <View style={styles.sectionHeaderLine} />
            </View>
          ) : null}
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

function Badge({ id, size = 32 }: { id?: string; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Glyph id={id} size={size * 0.48} color={ROSE} />
    </View>
  );
}

/** A sleek rose-to-peach progress bar with rounded tip. */
function Bar({ value }: { value: number }) {
  const share = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.track}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor={ROSE} />
            <Stop offset="100%" stopColor={PEACH} />
          </LinearGradient>
        </Defs>
        {share > 0 ? <Rect x="0" y="0" width={`${share * 100}%`} height="100%" rx={3} fill="url(#barGrad)" /> : null}
      </Svg>
    </View>
  );
}

const RING = 94;
const STROKE = 8;

/** A progress ring: `value` of `max`, with glowing gradient stroke and central typography. */
function Ring({ value, max }: { value: number; max: number }) {
  const r = (RING - STROKE) / 2;
  const length = 2 * Math.PI * r;
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={styles.ringContainer}>
      <Svg width={RING} height={RING}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={ROSE} />
            <Stop offset="100%" stopColor={PEACH} />
          </LinearGradient>
        </Defs>
        {/* Recessed background track */}
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke="rgba(255, 255, 255, 0.06)" strokeWidth={STROKE} fill="none" />
        {/* Active gradient progress stroke */}
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke="url(#ringGrad)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${length * share} ${length}`}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringValue}>{value}</Text>
        <Text style={styles.ringMax}>of {max}</Text>
      </View>
    </View>
  );
}

/** One card, drawn by its kind; the words and the icon id are the Mac's. */
function Card({ card }: { card: ProfileCard }) {
  if (card.kind === 'meter') {
    return (
      <View style={[styles.card, styles.half]}>
        <View style={styles.cardHeader}>
          <Badge id={card.icon} size={30} />
          <Text style={styles.meterPercent}>{Math.round(Math.max(0, Math.min(1, card.value)) * 100)}%</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {card.title}
        </Text>
        <Bar value={card.value} />
        {card.caption ? <Text style={styles.cardCaption}>{card.caption}</Text> : null}
      </View>
    );
  }

  if (card.kind === 'stat') {
    return (
      <View style={[styles.card, styles.half]}>
        <View style={styles.cardHeader}>
          <Badge id={card.icon} size={30} />
          <Text style={styles.cardTitle} numberOfLines={1}>
            {card.title}
          </Text>
        </View>
        <Text style={styles.statValue} numberOfLines={1}>
          {card.value}
        </Text>
        {card.caption ? <Text style={styles.cardCaption}>{card.caption}</Text> : null}
      </View>
    );
  }

  if (card.kind === 'ring') {
    return (
      <View style={[styles.card, styles.full, styles.ringCard]}>
        <Ring value={card.value} max={card.max} />
        <View style={styles.ringInfo}>
          <View style={styles.cardTitleRow}>
            <View style={styles.badgeSmall}>
              <Glyph id={card.icon} size={13} color={ROSE} />
            </View>
            <Text style={styles.cardTitle}>{card.title}</Text>
          </View>
          {card.caption ? (
            <View style={styles.ringCaptionCol}>
              {card.caption.split(' · ').map((part, i) =>
                i === 0 ? (
                  <View key={part} style={styles.ringPhasePill}>
                    <Text style={styles.ringPhaseText}>{part}</Text>
                  </View>
                ) : (
                  <Text key={part} style={styles.ringNoteText}>
                    {part}
                  </Text>
                )
              )}
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.full, styles.quoteCard]}>
      <View style={styles.quoteAccentBar} />
      <View style={styles.quoteInner}>
        <View style={styles.cardTitleRow}>
          <View style={styles.badgeSmall}>
            <Glyph id={card.icon} size={13} color={ROSE} />
          </View>
          <Text style={styles.cardTitle}>{card.title}</Text>
        </View>
        <Text style={styles.quoteText}>{card.value}</Text>
      </View>
    </View>
  );
}

function Tile({
  lane,
  photo,
  onOpen,
  onHold,
}: {
  lane: Lane;
  photo: ProfilePhoto;
  onOpen: (s: Source) => void;
  onHold: () => void;
}) {
  const source = useDrawn(lane, photo.name);
  return (
    <PressableScale
      onPress={() => source && onOpen(source)}
      onLongPress={onHold}
      accessibilityRole="imagebutton"
      accessibilityLabel={photo.liked ? 'Hearted photo' : 'Photo'}
      style={styles.tile}>
      {source ? (
        <Image source={source} style={styles.fill} contentFit="cover" transition={250} />
      ) : (
        <View style={styles.tilePlaceholder}>
          <Images size={18} color={Palette.faint} />
        </View>
      )}
      {photo.liked ? (
        <View style={styles.tileHeartBadge}>
          <Heart size={10} color={ROSE} fill={ROSE} />
        </View>
      ) : null}
    </PressableScale>
  );
}

function PhotoActionModal({
  photo,
  lane,
  onClose,
  onHeart,
  onDelete,
}: {
  photo: ProfilePhoto | null;
  lane: Lane;
  onClose: () => void;
  onHeart: () => void;
  onDelete: () => void;
}) {
  const source = useDrawn(lane, photo?.name ?? null);
  if (!photo) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalScrim} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <View style={styles.modalPreview}>
              {source ? (
                <Image source={source} style={styles.fill} contentFit="cover" />
              ) : (
                <Heart size={20} color={ROSE} />
              )}
            </View>
            <View style={styles.modalHeaderInfo}>
              <Text style={styles.modalHeaderTitle}>
                {photo.liked ? 'Hearted Photo' : 'Captured Moment'}
              </Text>
              <Text style={styles.modalHeaderSubtitle}>
                {photo.liked ? 'Hearted · in the next training set' : 'Personal photo'}
              </Text>
            </View>
          </View>

          <View style={styles.modalDivider} />

          <View style={styles.modalActions}>
            <PressableScale
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onHeart();
              }}
              accessibilityRole="button"
              style={styles.modalActionButton}>
              <View style={[styles.modalActionIcon, { backgroundColor: 'rgba(251, 113, 133, 0.15)' }]}>
                <Heart size={16} color={ROSE} fill={photo.liked ? ROSE : 'transparent'} />
              </View>
              <Text style={styles.modalActionText}>
                {photo.liked ? 'Remove from training' : 'Heart for training'}
              </Text>
            </PressableScale>

            <PressableScale
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onDelete();
              }}
              accessibilityRole="button"
              style={styles.modalActionButton}>
              <View style={[styles.modalActionIcon, { backgroundColor: 'rgba(255, 85, 85, 0.12)' }]}>
                <Trash2 size={16} color={Palette.alert} />
              </View>
              <Text style={[styles.modalActionText, { color: Palette.alert }]}>Delete photo</Text>
            </PressableScale>
          </View>

          <PressableScale
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
            }}
            accessibilityRole="button"
            style={styles.modalCancelButton}>
            <Text style={styles.modalCancelText}>Cancel</Text>
          </PressableScale>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  fill: { width: '100%', height: '100%' },

  ambientGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
    paddingVertical: Space.sm,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: Font.uiMedium,
    color: Palette.muted,
    fontSize: 11,
    letterSpacing: 2,
  },
  headerRight: {
    width: 38,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 4,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ROSE,
  },
  presenceAway: { backgroundColor: Palette.faint },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Gutter, gap: Space.md },
  errorCard: {
    backgroundColor: Palette.surfaceLift,
    padding: Space.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Palette.hairline,
    alignItems: 'center',
    gap: Space.md,
    maxWidth: 280,
  },
  errorText: { textAlign: 'center', color: Palette.muted },
  retryButton: {
    paddingHorizontal: Space.lg,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Palette.surfaceGlassHover,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
  },
  retryText: { fontFamily: Font.uiMedium, color: Palette.text, ...Type.small },

  loadingPulse: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.sm,
  },
  loadingInner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: { paddingHorizontal: Gutter, paddingBottom: Space.huge },
  top: { gap: Space.xl, paddingBottom: Space.sm },

  hero: { alignItems: 'center', gap: Space.sm },
  haloWrap: {
    width: HALO,
    height: HALO,
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceLift,
  },
  haloJewel: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ROSE,
    borderWidth: 2.5,
    borderColor: Palette.ground,
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroName: {
    marginTop: Space.xs,
    fontSize: 30,
    lineHeight: 36,
    textAlign: 'center',
  },
  heroAge: {
    fontFamily: Font.voice,
    color: Palette.muted,
    fontSize: 24,
  },

  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Space.sm,
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxWidth: '100%',
  },
  moodChip: {
    backgroundColor: 'rgba(251, 113, 133, 0.12)',
    borderColor: 'rgba(251, 113, 133, 0.3)',
  },
  chipText: {
    fontFamily: Font.uiMedium,
    color: Palette.muted,
    ...Type.small,
    flexShrink: 1,
  },

  /* Diary and memory links */
  links: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  linkCard: {
    flex: 1,
    padding: Space.md,
    borderRadius: 18,
    backgroundColor: Palette.surfaceLift,
    borderWidth: 1,
    borderColor: Palette.hairline,
    gap: 4,
  },
  linkCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  linkBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ROSE_SOFT,
  },
  linkTitle: {
    fontFamily: Font.uiMedium,
    color: Palette.text,
    fontSize: 14,
    lineHeight: 18,
  },
  linkSubtitle: {
    fontFamily: Font.ui,
    color: Palette.muted,
    fontSize: 11,
    lineHeight: 15,
  },

  /* Sections & Cards */
  sections: { gap: Space.xl },
  section: { gap: Space.sm },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: 2,
  },
  sectionHeaderTitle: {
    fontFamily: Font.uiMedium,
    color: Palette.faint,
    ...Type.micro,
    letterSpacing: 2,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  card: {
    backgroundColor: Palette.surfaceLift,
    borderRadius: 20,
    padding: Space.md,
    gap: 8,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  half: {
    flexBasis: '48.5%',
    flexGrow: 1,
    maxWidth: '50%',
  },
  full: {
    width: '100%',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    fontFamily: Font.uiMedium,
    color: Palette.muted,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  cardCaption: {
    fontFamily: Font.ui,
    color: Palette.faint,
    ...Type.micro,
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ROSE_SOFT,
  },
  badgeSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ROSE_SOFT,
  },
  meterPercent: {
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    fontSize: 20,
    lineHeight: 24,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
    marginTop: 2,
  },
  statValue: {
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    fontSize: 32,
    lineHeight: 38,
    marginTop: 2,
  },

  /* Ring Card */
  ringCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
    paddingVertical: Space.md + 2,
  },
  ringContainer: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    fontFamily: Font.voiceMedium,
    color: Palette.text,
    fontSize: 26,
    lineHeight: 30,
  },
  ringMax: {
    fontFamily: Font.ui,
    color: Palette.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  ringInfo: {
    flex: 1,
    gap: 6,
  },
  ringCaptionCol: {
    gap: 4,
    marginTop: 2,
  },
  ringPhasePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(251, 113, 133, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(251, 113, 133, 0.25)',
  },
  ringPhaseText: {
    fontFamily: Font.uiMedium,
    color: Palette.text,
    fontSize: 12,
    lineHeight: 16,
  },
  ringNoteText: {
    fontFamily: Font.ui,
    color: Palette.muted,
    fontSize: 12,
    lineHeight: 17,
  },

  /* Quote Card */
  quoteCard: {
    position: 'relative',
    overflow: 'hidden',
    paddingLeft: Space.lg,
  },
  quoteAccentBar: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3.5,
    borderRadius: 2,
    backgroundColor: ROSE,
  },
  quoteInner: {
    gap: Space.sm,
  },
  quoteText: {
    fontFamily: Font.voiceItalic,
    color: Palette.text,
    fontSize: 16,
    lineHeight: 24,
  },

  /* Photos Section */
  photosHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.sm,
  },
  photosTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoCountPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  photoCountText: {
    fontFamily: Font.uiMedium,
    color: Palette.muted,
    fontSize: 10,
    lineHeight: 14,
  },
  trainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(253, 186, 116, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(253, 186, 116, 0.3)',
  },
  trainText: {
    fontFamily: Font.uiMedium,
    color: PEACH,
    ...Type.micro,
  },
  photosHint: {
    fontFamily: Font.ui,
    color: Palette.faint,
    ...Type.micro,
    marginTop: -Space.sm,
  },
  gridRow: {
    gap: Space.xs + 2,
    marginBottom: Space.xs + 2,
  },
  tile: {
    flex: 1 / 3,
    aspectRatio: 768 / 960,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Palette.surfaceLift,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  tilePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceLift,
  },
  tileHeartBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(9, 8, 14, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPhotosContainer: {
    paddingVertical: Space.xxl,
    alignItems: 'center',
    gap: Space.xs,
  },
  emptyPhotosIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Palette.surfaceLift,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs,
  },
  emptyPhotosTitle: {
    fontFamily: Font.uiMedium,
    color: Palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyPhotosSubtitle: {
    textAlign: 'center',
    maxWidth: 240,
    color: Palette.faint,
  },

  /* Photo Action Modal Sheet */
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(5, 4, 9, 0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Palette.ground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: Palette.hairline,
    paddingHorizontal: Gutter,
    paddingTop: Space.sm,
    paddingBottom: Space.xl,
    gap: Space.md,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignSelf: 'center',
    marginBottom: Space.xs,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  modalPreview: {
    width: 48,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Palette.surfaceLift,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  modalHeaderTitle: {
    fontFamily: Font.uiMedium,
    color: Palette.text,
    fontSize: 15,
    lineHeight: 20,
  },
  modalHeaderSubtitle: {
    fontFamily: Font.ui,
    color: Palette.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  modalDivider: {
    height: 1,
    backgroundColor: Palette.hairline,
  },
  modalActions: {
    gap: Space.sm,
  },
  modalActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.sm,
    borderRadius: 14,
    backgroundColor: Palette.surfaceGlass,
  },
  modalActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionText: {
    fontFamily: Font.uiMedium,
    color: Palette.text,
    fontSize: 14,
  },
  modalCancelButton: {
    paddingVertical: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: Palette.surfaceLift,
    marginTop: Space.xs,
  },
  modalCancelText: {
    fontFamily: Font.uiMedium,
    color: Palette.muted,
    fontSize: 14,
  },
});

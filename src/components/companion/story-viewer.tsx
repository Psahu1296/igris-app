import { Image } from 'expo-image';
import { ArrowUp, Heart, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { Meta } from '@/components/typography';
import { Font, Gutter, Palette, Space, Type } from '@/constants/theme';
import { likeStory, markStorySeen, type CompanionStory } from '@/lib/companion';
import { drawnSource, type Lane } from '@/lib/maestro';

/** How long one story shows before the next. */
const SHOW_MS = 5000;

/**
 * Her stories full screen, like a status viewer (maestro companion/stories.py): bars across the
 * top, five seconds each, tap the left third to go back and the rest to go on; typing a reply
 * pauses it. A reply is sent as a normal message that knows which story it answers.
 */
export function StoryViewer({
  lane,
  name,
  stories,
  accent,
  onReply,
  onClose,
}: {
  lane: Lane;
  name: string;
  stories: CompanionStory[];
  accent: string;
  onReply: (story: CompanionStory, text: string) => void;
  onClose: () => void;
}) {
  // Start at the first one he has not seen, like a status app.
  const [index, setIndex] = useState(() => Math.max(0, stories.findIndex((s) => !s.seen)));
  // The photo, tagged with its story: a photo still loading from the last story is never shown.
  const [loaded, setLoaded] = useState<{ id: string; uri: string; headers: Record<string, string> } | null>(null);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  // Hearts by story id, over what the Mac sent; flipped at once, undone if the Mac refuses.
  const [hearts, setHearts] = useState<Record<string, boolean>>({});
  const progress = useSharedValue(0);
  const story = stories[index];
  const source = loaded && story && loaded.id === story.id ? { uri: loaded.uri, headers: loaded.headers } : null;

  const next = () => (index + 1 < stories.length ? setIndex(index + 1) : onClose());
  const back = () => setIndex(Math.max(0, index - 1));

  useEffect(() => {
    if (!story) return;
    let live = true;
    drawnSource(lane, story.image.name)
      .then((s) => live && setLoaded({ id: story.id, ...s }))
      .catch(() => {});
    if (!story.seen) void markStorySeen(lane, story.id);
    return () => {
      live = false;
    };
  }, [lane, story]);

  // The bar runs once the photo is in, and holds while he types a reply.
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    if (!source || typing) return;
    progress.value = withTiming(1, { duration: SHOW_MS, easing: Easing.linear }, (done) => {
      if (done) runOnJS(next)();
    });
    return () => cancelAnimation(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `next` changes every render; index is what matters
  }, [loaded, typing, index]);

  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  if (!story) return null;

  const liked = hearts[story.id] ?? !!story.liked;
  const toggleHeart = () => {
    const on = !liked;
    setHearts((h) => ({ ...h, [story.id]: on }));
    likeStory(lane, story.id, on).catch(() => setHearts((h) => ({ ...h, [story.id]: !on })));
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    onReply(story, text);
    onClose();
  };

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.screen}>
        {source ? <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
          <View style={styles.bars}>
            {stories.map((s, i) => (
              <View key={s.id} style={styles.track}>
                {i < index ? <View style={[styles.fillBar, { width: '100%' }]} /> : null}
                {i === index ? <Animated.View style={[styles.fillBar, bar]} /> : null}
              </View>
            ))}
          </View>
          <View style={styles.head}>
            <Text style={styles.name}>{name}</Text>
            <Meta style={styles.when}>{ago(story.at)}</Meta>
            <View style={styles.fill} />
            <PressableScale onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
              <X size={20} color="#fff" />
            </PressableScale>
          </View>
          {/* Left third back, the rest on: the way status viewers work. */}
          <View style={styles.taps}>
            <Pressable style={styles.left} onPress={back} accessibilityRole="button" accessibilityLabel="Previous story" />
            <Pressable style={styles.right} onPress={next} accessibilityRole="button" accessibilityLabel="Next story" />
          </View>
          {story.caption ? <Text style={styles.caption}>{story.caption}</Text> : null}
          <View style={styles.reply}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              placeholder={`Reply to ${name}…`}
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={styles.input}
              onSubmitEditing={send}
              accessibilityLabel="Reply to her story"
            />
            <PressableScale
              onPress={toggleHeart}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={liked ? 'Remove heart' : 'Heart this story'}
              style={styles.heart}>
              <Heart size={24} color={liked ? accent : '#fff'} fill={liked ? accent : 'none'} />
            </PressableScale>
            <PressableScale
              onPress={send}
              disabled={!draft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send reply"
              style={[styles.send, { backgroundColor: accent, opacity: draft.trim() ? 1 : 0.5 }]}>
              <ArrowUp size={18} color={Palette.ground} />
            </PressableScale>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** "12m", "3h", for the story's age. */
function ago(at: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60_000));
  return Number.isNaN(minutes) ? '' : minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  fill: { flex: 1 },
  bars: { flexDirection: 'row', gap: 4, paddingHorizontal: Space.sm, paddingTop: Space.sm },
  track: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  fillBar: { height: 3, backgroundColor: '#fff' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Gutter, paddingTop: Space.md },
  name: { fontFamily: Font.uiMedium, color: '#fff', ...Type.ask, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  when: { color: 'rgba(255,255,255,0.8)' },
  close: { padding: 4 },
  taps: { flex: 1, flexDirection: 'row' },
  left: { flex: 1 },
  right: { flex: 2 },
  caption: {
    alignSelf: 'center',
    marginHorizontal: Gutter,
    marginBottom: Space.lg,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.45)',
    color: '#fff',
    fontFamily: Font.voice,
    ...Type.answer,
    textAlign: 'center',
  },
  reply: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Gutter, paddingBottom: Space.md },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: Space.lg,
    color: '#fff',
    fontFamily: Font.ui,
    ...Type.ask,
  },
  heart: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});

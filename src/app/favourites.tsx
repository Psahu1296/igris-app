import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Search, Star, Trash2, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { Answer, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space } from '@/constants/theme';
import { findCallee, type Contact } from '@/lib/device';
import {
  COUNTDOWN_MS,
  isFavourite,
  setAlias,
  toggleFavourite,
  useFavourites,
  type Favourite,
} from '@/lib/favourites';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import { useSession } from '@/state/session';

/**
 * Quick call: who Igris may ring without a tap (lib/favourites.ts).
 *
 * Search runs against the phone's own contacts through the same lookup a spoken
 * "call X" uses, so what you find here is what Igris would find.
 */
export default function Favourites() {
  const { lanePref } = useSession();
  const accent = laneColor(lanePref);
  const favourites = useFavourites();
  const bottomInset = useKeyboardInset();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Debounced: every keystroke is a contacts-provider query otherwise.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let stale = false;
    const timer = setTimeout(() => {
      findCallee({ kind: 'call', name: q, number: null })
        .then((found) => {
          if (stale) return;
          setResults(found);
          setSearchError(null);
        })
        .catch((err: unknown) => {
          if (stale) return;
          setResults([]);
          setSearchError(err instanceof Error ? err.message : 'Search failed.');
        });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Under two letters there is no search, so stale results are hidden, not cleared.
  const searching = query.trim().length >= 2;
  const shown = searching ? results : [];
  const shownError = searching ? searchError : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <Star size={20} color={accent} />
          <Title style={styles.headerTitle}>Quick call</Title>
        </View>
        <PressableScale
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.backButton}>
          <X size={18} color={Palette.text} />
        </PressableScale>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Space.xl + bottomInset }]}
        keyboardShouldPersistTaps="handled">
        <Answer style={styles.lede}>
          {`Igris calls these people without asking you to tap — after a ${COUNTDOWN_MS / 1000}-second countdown you can cancel. Everyone else still needs a tap.`}
        </Answer>

        {favourites.length > 0 ? (
          <View style={styles.section}>
            <Meta style={styles.sectionTitle}>YOUR LIST</Meta>
            {favourites.map((favourite) => (
              <FavouriteRow key={favourite.number} favourite={favourite} accent={accent} />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <Meta style={styles.sectionTitle}>ADD FROM CONTACTS</Meta>
          <View style={styles.searchBox}>
            <Search size={16} color={Palette.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search a name"
              placeholderTextColor={Palette.faint}
              autoCorrect={false}
              style={styles.searchInput}
            />
          </View>
          {shownError ? <Meta style={styles.error}>{shownError}</Meta> : null}
          {shown.map((contact) => {
            const starred = isFavourite(favourites, contact);
            return (
              <PressableScale
                key={`${contact.name}|${contact.number}`}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  toggleFavourite(contact);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${starred ? 'Remove' : 'Add'} ${contact.name}`}
                style={styles.row}>
                <Initial name={contact.name} accent={accent} />
                <View style={styles.who}>
                  <Text style={styles.name} numberOfLines={1}>
                    {contact.name}
                  </Text>
                  <Meta style={styles.number} numberOfLines={1}>
                    {`${contact.label} · ${contact.number}`}
                  </Meta>
                </View>
                <Star
                  size={20}
                  color={starred ? accent : Palette.faint}
                  fill={starred ? accent : 'transparent'}
                />
              </PressableScale>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function FavouriteRow({ favourite, accent }: { favourite: Favourite; accent: string }) {
  // Local draft, committed on blur: writing SecureStore per keystroke is wasteful.
  const [alias, setDraft] = useState(favourite.alias ?? '');

  return (
    <View style={styles.favourite}>
      <View style={styles.rowInner}>
        <Initial name={favourite.name} accent={accent} />
        <View style={styles.who}>
          <Text style={styles.name} numberOfLines={1}>
            {favourite.name}
          </Text>
          <Meta style={styles.number} numberOfLines={1}>
            {`${favourite.label} · ${favourite.number}`}
          </Meta>
        </View>
        <PressableScale
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            toggleFavourite(favourite);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${favourite.name}`}
          style={styles.remove}>
          <Trash2 size={16} color={Palette.muted} />
        </PressableScale>
      </View>
      <View style={styles.aliasBox}>
        <Meta style={styles.aliasLabel}>Also answers to</Meta>
        <TextInput
          value={alias}
          onChangeText={setDraft}
          onBlur={() => setAlias(favourite, alias)}
          onSubmitEditing={() => setAlias(favourite, alias)}
          placeholder="e.g. mom"
          placeholderTextColor={Palette.faint}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          style={[styles.aliasInput, { color: accent }]}
        />
      </View>
    </View>
  );
}

function Initial({ name, accent }: { name: string; accent: string }) {
  return (
    <View style={[styles.avatar, { backgroundColor: accent + '22' }]}>
      <Text style={[styles.initial, { color: accent }]}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.ground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Gutter,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  headerTitle: { fontSize: 22 },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Palette.surfaceLift,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  content: { paddingHorizontal: Gutter, paddingTop: Space.lg, gap: Space.xl },
  lede: { color: Palette.muted, fontSize: 15, lineHeight: 22 },
  section: { gap: Space.sm },
  sectionTitle: { fontSize: 10, letterSpacing: 1.2, color: Palette.faint },
  favourite: {
    padding: Space.md,
    borderRadius: 12,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
    gap: Space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { fontFamily: Font.uiMedium, fontSize: 15 },
  who: { flex: 1 },
  name: { fontFamily: Font.voiceMedium, color: Palette.text, fontSize: 16 },
  number: { color: Palette.muted, fontSize: 12 },
  remove: { padding: Space.xs },
  aliasBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingLeft: 36 + Space.md,
  },
  aliasLabel: { color: Palette.faint, fontSize: 12 },
  aliasInput: {
    flex: 1,
    fontFamily: Font.uiMedium,
    fontSize: 14,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: 12,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  searchInput: {
    flex: 1,
    color: Palette.text,
    fontFamily: Font.ui,
    fontSize: 15,
    paddingVertical: Space.md,
  },
  error: { color: Palette.alert, fontSize: 13 },
});

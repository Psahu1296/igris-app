import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronUp, Pencil, Pin, PinOff, Sparkles } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet, sheetStyles } from '@/components/companion/bottom-sheet';
import { PressableScale } from '@/components/pressable-scale';
import { TypingIndicator } from '@/components/typing-indicator';
import { Meta } from '@/components/typography';
import { Font, Gutter, Palette, Space } from '@/constants/theme';
import {
  clearDirection,
  correctPhoto,
  directorFromMoment,
  directPhoto,
  fetchDirector,
  previewDirection,
  type CompanionPhoto,
  type Direction,
  type Director,
  type DirectorField,
} from '@/lib/companion';
import type { Lane } from '@/lib/maestro';

/** Levels where a pose can be picked (maestro companion/poses.py LEVELS). */
const ACT_LEVELS = ['explicit', 'peak'];
const COUNTS = [1, 2, 3, 4];

/** The sheet's parts, by field id. A field the Mac adds later lands in "More". */
const GROUPS: { title: string; ids: string[]; folded?: boolean }[] = [
  { title: 'Shot', ids: ['together', 'level', 'pose', 'shot', 'framing'] },
  { title: 'Her', ids: ['wearing', 'colour', 'visible', 'doing', 'hands', 'expression', 'hair', 'makeup'] },
  { title: 'Scene', ids: ['where', 'light', 'style'] },
  { title: 'More', ids: ['view', 'him', 'extra'], folded: true },
];
const GROUPED = new Set(GROUPS.flatMap((g) => g.ids));

/** A chip's words: a long suggestion ("heavy-lidded eyes on the lens, lips slightly apart, …") cut
 * to its first clause, so a row shows several chips, not one truncated sentence. */
const short = (text: string) => {
  const head = text.split(/[,;:]/)[0].trim();
  const cut = head.length > 30 ? `${head.slice(0, 28).trimEnd()}…` : head;
  return cut.charAt(0).toUpperCase() + cut.slice(1);
};

/**
 * The photo director: chips (and a box, for words) per part of the photo, in four groups —
 * Shot, Her, Scene, and More (folded). Opens on what he pinned in this scene, or on one
 * photo's own choices with `like` — "same photo, change one thing", drawn with that photo's
 * seed. An empty field is the scene as it is on the Mac (shown as "now:"), and each row offers
 * the chips that fit the scene first. "Fill from the moment" asks the Mac to plan the moment
 * like the camera button would and fills every chip with it. The prompt his choices make is
 * shown as he picks, and he can edit it: an edited prompt is drawn as he wrote it.
 */
export function DirectorSheet({
  lane,
  accent,
  like,
  onClose,
  onSent,
}: {
  lane: Lane;
  accent: string;
  /** Start from this photo of hers: its choices, and its seed while "Same seed" is on. */
  like?: CompanionPhoto | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [director, setDirector] = useState<Director | null>(null);
  const [choice, setChoice] = useState<Direction>(like?.direction ?? {});
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState(true);
  const [sameSeed, setSameSeed] = useState(!!like?.seed);
  const [count, setCount] = useState(1);
  const [preview, setPreview] = useState<{ prompt: string; notes: string[] } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  /** His own words for the prompt; null = the prompt the chips make. */
  const [edited, setEdited] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    let live = true;
    fetchDirector(lane)
      .then((got) => {
        if (!live) return;
        setDirector(got);
        if (!like?.direction) setChoice(got.pins);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [lane, like]);

  const request = useMemo(
    () => ({ direction: choice, like: sameSeed && like ? like.name : undefined, pin, count, prompt: edited?.trim() || undefined }),
    [choice, sameSeed, like, pin, count, edited]
  );

  // The prompt, asked again a moment after he stops picking.
  const asked = useRef(0);
  useEffect(() => {
    if (!director) return;
    const mine = ++asked.current;
    const timer = setTimeout(() => {
      previewDirection(lane, request)
        .then((got) => mine === asked.current && setPreview(got))
        .catch((e: unknown) => mine === asked.current && setError(e instanceof Error ? e.message : String(e)));
    }, 400);
    return () => clearTimeout(timer);
  }, [lane, director, request]);

  // Typed words are kept as typed (the Mac trims them); the preview waits for a pause anyway.
  const set = (id: string, value: string, tapped = true) => {
    if (tapped) void Haptics.selectionAsync();
    setError(null);
    setChoice((c) => {
      const next = { ...c };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
  };

  const send = async () => {
    setSending(true);
    try {
      await directPhoto(lane, request);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const fillFromMoment = async () => {
    void Haptics.selectionAsync();
    setFilling(true);
    setError(null);
    try {
      setChoice(await directorFromMoment(lane));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFilling(false);
    }
  };

  const clearAll = async () => {
    setChoice({});
    setEdited(null);
    try {
      await clearDirection(lane);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const level = choice.level ?? director?.defaults.level ?? '';
  const together = (choice.together ?? director?.defaults.together) === 'together';
  const shown = (f: DirectorField) =>
    (f.id !== 'pose' || ACT_LEVELS.includes(level) || !!choice.pose) &&
    (f.id !== 'him' || together);
  const locked = edited !== null;

  const groups = director
    ? GROUPS.map((g) => ({
        ...g,
        fields: director.fields.filter(
          (f) => shown(f) && (g.ids.includes(f.id) || (g.title === 'More' && !GROUPED.has(f.id)))
        ),
      })).filter((g) => g.fields.length)
    : [];

  const editPrompt = () => {
    void Haptics.selectionAsync();
    setShowPrompt(true);
    setEdited(preview?.prompt ?? '');
  };

  return (
    <BottomSheet title={like ? 'Change this photo' : 'Direct a photo'} error={error} onClose={onClose}>
      {director === null ? (
        <View style={sheetStyles.empty}>{error ? null : <TypingIndicator color={accent} />}</View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <PressableScale
              onPress={() => (filling || locked ? undefined : void fillFromMoment())}
              accessibilityRole="button"
              accessibilityState={{ busy: filling, disabled: locked }}
              style={[styles.fill, { borderColor: accent, opacity: locked ? 0.4 : 1 }]}>
              <Sparkles size={16} color={accent} />
              <View style={styles.flex}>
                <Text style={styles.fillTitle}>{filling ? 'Reading the moment…' : 'Fill from the moment'}</Text>
                <Meta style={styles.hint}>Her model reads the chat and fills every part. Change any of it after.</Meta>
              </View>
              {filling ? <TypingIndicator color={accent} /> : null}
            </PressableScale>
            {!like && Object.keys(director.pins).length && choice === director.pins ? (
              <Meta style={styles.note}>Your pin from this scene.</Meta>
            ) : null}

            <View style={[styles.groups, locked ? styles.dimmed : null]} pointerEvents={locked ? 'none' : 'auto'}>
              {groups.map((g) => {
                const set_ = g.fields.filter((f) => choice[f.id]).length;
                const isOpen = open[g.title] ?? !g.folded;
                return (
                  <View key={g.title} style={styles.group}>
                    <PressableScale
                      onPress={() => setOpen((o) => ({ ...o, [g.title]: !isOpen }))}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: isOpen }}
                      style={styles.groupHead}>
                      <Text style={styles.groupTitle}>{g.title}</Text>
                      {set_ ? <Meta style={{ color: accent }}>{set_} set</Meta> : null}
                      <View style={styles.flex} />
                      {isOpen ? <ChevronUp size={16} color={Palette.muted} /> : <ChevronDown size={16} color={Palette.muted} />}
                    </PressableScale>
                    {isOpen
                      ? g.fields.map((f) => (
                          <FieldRow
                            key={f.id}
                            field={f}
                            suggested={director.suggest?.[f.id] ?? []}
                            value={choice[f.id] ?? ''}
                            now={director.defaults[f.id] ?? ''}
                            accent={accent}
                            onChange={(v) => set(f.id, v)}
                            onType={(v) => set(f.id, v, false)}
                          />
                        ))
                      : null}
                  </View>
                );
              })}
            </View>

            <View style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>Prompt</Text>
                {locked ? <Meta style={{ color: accent }}>edited</Meta> : null}
                <View style={styles.flex} />
                {locked ? (
                  <Chip title="Back to the chips" accent={accent} onPress={() => setEdited(null)} />
                ) : (
                  <>
                    <Chip title="Edit" accent={accent} icon={<Pencil size={12} color={Palette.muted} />} onPress={editPrompt} />
                    <PressableScale
                      onPress={() => setShowPrompt((s) => !s)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={showPrompt ? 'Hide the prompt' : 'Show the prompt'}>
                      {showPrompt ? <ChevronUp size={16} color={Palette.muted} /> : <ChevronDown size={16} color={Palette.muted} />}
                    </PressableScale>
                  </>
                )}
              </View>
              {preview?.notes.length ? <Meta style={styles.note}>{preview.notes.join(' ')}</Meta> : null}
              {locked ? (
                <>
                  <TextInput
                    value={edited}
                    onChangeText={setEdited}
                    multiline
                    autoFocus
                    style={[styles.input, styles.promptInput]}
                    placeholderTextColor={Palette.faint}
                    placeholder="The whole prompt, as the image model reads it"
                    accessibilityLabel="Prompt"
                  />
                  <Meta style={styles.hint}>Drawn exactly as written. The chips above do not change it until you go back to them.</Meta>
                </>
              ) : showPrompt && preview ? (
                <Text selectable style={styles.prompt}>
                  {preview.prompt}
                </Text>
              ) : null}
            </View>

            <View style={styles.wrap}>
              <Chip
                title={pin ? 'Pin for this scene' : 'Just this once'}
                selected={pin}
                accent={accent}
                icon={pin ? <Pin size={12} color={Palette.ground} /> : <PinOff size={12} color={Palette.muted} />}
                onPress={() => setPin((p) => !p)}
              />
              {like?.seed ? (
                <Chip title="Same seed" selected={sameSeed} accent={accent} onPress={() => setSameSeed((s) => !s)} />
              ) : null}
              {Object.keys(choice).length || locked ? (
                <Chip title="Clear all" accent={accent} onPress={() => void clearAll()} />
              ) : null}
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <View style={styles.counts} accessibilityRole="radiogroup" accessibilityLabel="How many photos">
              {COUNTS.map((n) => (
                <PressableScale
                  key={n}
                  onPress={() => setCount(n)}
                  hitSlop={4}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: count === n }}
                  style={[styles.count, count === n ? { backgroundColor: accent, borderColor: accent } : null]}>
                  <Text style={[styles.chipText, count === n ? styles.chipTextOn : null]}>{n}</Text>
                </PressableScale>
              ))}
            </View>
            <PressableScale
              onPress={() => void send()}
              disabled={sending || (locked && !edited?.trim())}
              accessibilityRole="button"
              style={[styles.go, styles.flex, { backgroundColor: accent, opacity: sending ? 0.5 : 1 }]}>
              <Text style={styles.goText}>{sending ? 'Sending…' : count === 1 ? 'Take the photo' : `Take ${count} photos`}</Text>
            </PressableScale>
          </View>
        </>
      )}
    </BottomSheet>
  );
}

function FieldRow({
  field,
  suggested,
  value,
  now,
  accent,
  onChange,
  onType,
}: {
  field: DirectorField;
  /** Chips that fit the scene, before the field's fixed ones. */
  suggested: string[];
  value: string;
  now: string;
  accent: string;
  onChange: (value: string) => void;
  onType: (value: string) => void;
}) {
  const nowLabel = field.choices.find((c) => c.value === now)?.label ?? now;
  const fixed = new Set(suggested);
  const chips = [
    ...suggested.map((v) => ({ value: v, label: short(v) })),
    ...field.choices.filter((c) => !fixed.has(c.value)).map((c) => ({ ...c, label: short(c.label) })),
  ];
  return (
    <View style={styles.section}>
      <View style={styles.labelRow}>
        <Meta style={styles.label}>{field.label}</Meta>
        {!value && now ? (
          <Meta numberOfLines={1} style={styles.now}>
            now: {nowLabel}
          </Meta>
        ) : null}
      </View>
      {chips.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
          {chips.map((c) => (
            <Chip key={c.value} title={c.label} selected={value === c.value} accent={accent} onPress={() => onChange(value === c.value ? '' : c.value)} />
          ))}
        </ScrollView>
      ) : null}
      {field.kind === 'text' ? (
        <TextInput
          value={value}
          onChangeText={onType}
          placeholder={now || field.hint || 'Anything'}
          placeholderTextColor={Palette.faint}
          style={styles.input}
          multiline
          accessibilityLabel={field.label}
        />
      ) : null}
      {field.hint && field.kind === 'pick' ? <Meta style={styles.hint}>{field.hint}</Meta> : null}
    </View>
  );
}

function Chip({
  title,
  selected = false,
  accent,
  icon,
  onPress,
}: {
  title: string;
  selected?: boolean;
  accent: string;
  icon?: ReactNode;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected ? { backgroundColor: accent, borderColor: accent } : null]}>
      {icon}
      <Text numberOfLines={1} style={[styles.chipText, selected ? styles.chipTextOn : null]}>
        {title}
      </Text>
    </PressableScale>
  );
}

/**
 * What came out wrong in one of her photos. Marked faults teach the Mac (the next photos
 * of that camera get the fix first); "Retake" also draws this photo again, same seed, with
 * the fixes. Opens with what the Mac's own check found already marked.
 */
export function FixSheet({
  lane,
  accent,
  photo,
  onClose,
  onSent,
}: {
  lane: Lane;
  accent: string;
  photo: CompanionPhoto;
  onClose: () => void;
  onSent: (retook: boolean) => void;
}) {
  const [faults, setFaults] = useState<{ id: string; label: string }[] | null>(null);
  const [wrong, setWrong] = useState<string[]>(photo.faults ?? []);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    fetchDirector(lane)
      .then((got) => live && setFaults(got.faults))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [lane]);

  const send = async (retake: boolean) => {
    setSending(true);
    try {
      await correctPhoto(lane, photo.name, wrong, retake);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSent(retake);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet title="What's wrong?" error={error} onClose={onClose}>
      {faults === null ? (
        <View style={sheetStyles.empty}>{error ? null : <TypingIndicator color={accent} />}</View>
      ) : (
        <View style={styles.body}>
          {photo.faults?.length ? <Meta>Marked: what the check on the Mac saw.</Meta> : null}
          <View style={styles.wrap}>
            {faults.map((f) => (
              <Chip
                key={f.id}
                title={f.label}
                selected={wrong.includes(f.id)}
                accent={accent}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setWrong((w) => (w.includes(f.id) ? w.filter((x) => x !== f.id) : [...w, f.id]));
                }}
              />
            ))}
          </View>
          <View style={styles.buttons}>
            <PressableScale
              onPress={() => void send(false)}
              disabled={sending || !wrong.length}
              accessibilityRole="button"
              style={[styles.ghost, { opacity: sending || !wrong.length ? 0.4 : 1 }]}>
              <Text style={styles.chipText}>Just note it</Text>
            </PressableScale>
            <PressableScale
              onPress={() => void send(true)}
              disabled={sending || !wrong.length}
              accessibilityRole="button"
              style={[styles.go, styles.flex, { backgroundColor: accent, opacity: sending || !wrong.length ? 0.4 : 1 }]}>
              <Text style={styles.goText}>Retake with fixes</Text>
            </PressableScale>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: Gutter, gap: Space.md, paddingBottom: Space.lg },
  section: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', gap: Space.sm },
  label: { color: Palette.text },
  now: { flex: 1, color: Palette.faint, fontSize: 11 },
  hint: { color: Palette.faint, fontSize: 11 },
  note: { color: Palette.muted },
  row: { gap: Space.sm, paddingRight: Gutter },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Palette.hairline,
    maxWidth: 260,
  },
  chipText: { fontFamily: Font.ui, fontSize: 13, color: Palette.text },
  chipTextOn: { color: Palette.ground },
  input: {
    fontFamily: Font.ui,
    fontSize: 14,
    color: Palette.text,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 90,
  },
  prompt: { fontFamily: Font.ui, fontSize: 12, lineHeight: 17, color: Palette.muted },
  promptInput: { maxHeight: 220, minHeight: 120, fontSize: 12, lineHeight: 17, textAlignVertical: 'top' },
  fill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: Palette.surfaceGlass,
  },
  fillTitle: { fontFamily: Font.uiMedium, fontSize: 14, color: Palette.text },
  group: { gap: Space.sm, paddingTop: Space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Palette.hairline },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, minHeight: 32 },
  groupTitle: { fontFamily: Font.uiMedium, fontSize: 15, color: Palette.text },
  groups: { gap: Space.md },
  dimmed: { opacity: 0.35 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Gutter, paddingTop: Space.sm },
  counts: { flexDirection: 'row', gap: 6 },
  count: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  buttons: { flexDirection: 'row', gap: Space.sm, marginTop: Space.sm },
  flex: { flex: 1 },
  go: { height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Space.lg },
  ghost: {
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  goText: { fontFamily: Font.ui, fontSize: 15, color: Palette.ground },
});

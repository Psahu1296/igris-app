import * as Haptics from 'expo-haptics';
import { Minus, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { Meta, Title } from '@/components/typography';
import { Font, Palette, Space } from '@/constants/theme';
import { clock, type Priority, type Recurrence, type Todo, type TodoEdit } from '@/lib/todos';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';

/**
 * Changing a todo by hand: title, priority, and when — once at a time, repeating, or
 * anytime. Adding still goes through Igris (the parser and its read-back live in
 * maestro); this is for fixing what is already there without re-dictating it.
 *
 * No date-picker library: that is another native module and another rebuild for two
 * inputs, and chips + steppers are quicker to hit with a thumb anyway. maestro checks
 * everything again (todos.edit_fields) and its refusal is shown as it is.
 */

type Mode = 'anytime' | 'once' | 'repeat';
type Clock = { h: number; m: number }; // 24-hour

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'must', label: 'Must-do' },
];
const FREQS: { value: Recurrence['freq']; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Some days' },
];
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']; // maestro's 0 = Monday
const DAYS_AHEAD = 14;
const MAX_TIMES = 6;

const hhmm = ({ h, m }: Clock) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const parseClock = (s: string): Clock => {
  const [h, m] = s.split(':').map(Number);
  return { h, m };
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The next whole hour: a sensible first guess when a time is added. */
function nextHour(): Clock {
  return { h: (new Date().getHours() + 1) % 24, m: 0 };
}

type EditorProps = {
  accent: string;
  onClose: () => void;
  /** Resolves when saved; a thrown Error's message is shown in the sheet. */
  onSave: (todo: Todo, edit: TodoEdit) => Promise<void>;
};

export function TodoEditor({ todo, ...props }: EditorProps & { todo: Todo | null }) {
  // Keyed by todo, so each open starts from that todo's fields with fresh state.
  return todo ? <Sheet key={todo.id} todo={todo} {...props} /> : null;
}

/** Where a todo stands, as the sheet's starting state. */
function initial(todo: Todo) {
  const r = todo.recurrence;
  const due = todo.due_at ? new Date(todo.due_at) : null;
  const offset = due
    ? Math.round((startOfDay(due).getTime() - startOfDay(new Date()).getTime()) / 86_400_000)
    : 0;
  return {
    mode: (r ? 'repeat' : due ? 'once' : 'anytime') as Mode,
    dayOffset: Math.min(Math.max(offset, 0), DAYS_AHEAD - 1),
    onceAt: due ? { h: due.getHours(), m: due.getMinutes() } : nextHour(),
    times: r ? r.times.map(parseClock) : [nextHour()],
    // "Now" for the passed-time check, read once when the sheet opens, not in render.
    openedAt: Date.now(),
  };
}

function Sheet({ todo, accent, onClose, onSave }: EditorProps & { todo: Todo }) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const [start] = useState(() => initial(todo));
  const [title, setTitle] = useState(todo.title);
  const [priority, setPriority] = useState<Priority>(todo.priority);
  const [mode, setMode] = useState<Mode>(start.mode);
  const [dayOffset, setDayOffset] = useState(start.dayOffset);
  const [onceAt, setOnceAt] = useState<Clock>(start.onceAt);
  const [freq, setFreq] = useState<Recurrence['freq']>(todo.recurrence?.freq ?? 'daily');
  const [days, setDays] = useState<number[]>(todo.recurrence?.days ?? []);
  const [times, setTimes] = useState<Clock[]>(start.times);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const openedAt = start.openedAt;

  const onceDate = () => {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() + dayOffset);
    d.setHours(onceAt.h, onceAt.m, 0, 0);
    return d;
  };
  const inPast = mode === 'once' && onceDate().getTime() < openedAt;

  const when = (): Pick<TodoEdit, 'due_at' | 'recurrence'> => {
    if (mode === 'once') return { due_at: onceDate().toISOString(), recurrence: null };
    if (mode === 'repeat') {
      const unique = [...new Set(times.map(hhmm))].sort();
      return {
        due_at: null,
        recurrence: { freq, days: freq === 'weekly' ? [...days].sort() : [], times: unique },
      };
    }
    return { due_at: null, recurrence: null };
  };

  /** Only what changed. An untouched, already-passed time must not be re-sent: maestro refuses past times. */
  const changes = (): TodoEdit => {
    const edit: TodoEdit = {};
    if (title.trim() !== todo.title) edit.title = title.trim();
    if (priority !== todo.priority) edit.priority = priority;
    const next = when();
    const same =
      next.recurrence && todo.recurrence
        ? JSON.stringify(next.recurrence) ===
          JSON.stringify({ ...todo.recurrence, days: [...todo.recurrence.days].sort() })
        : next.due_at && todo.due_at
          ? Math.abs(new Date(next.due_at).getTime() - new Date(todo.due_at).getTime()) < 60_000
          : !next.due_at && !next.recurrence && !todo.due_at && !todo.recurrence;
    if (!same) Object.assign(edit, next);
    return edit;
  };

  const save = async () => {
    const edit = changes();
    if (Object.keys(edit).length === 0) return onClose();
    if (!title.trim()) return setProblem('A todo needs a title.');
    if (mode === 'repeat' && freq === 'weekly' && days.length === 0) {
      return setProblem('Pick the days it repeats on.');
    }
    if ('due_at' in edit && inPast) return setProblem('That time has already passed.');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    setProblem(null);
    try {
      await onSave(todo, edit);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'That did not save.');
      setSaving(false);
    }
  };

  const tap = () => void Haptics.selectionAsync();

  return (
    <Modal visible transparent statusBarTranslucent navigationBarTranslucent animationType="none" onRequestClose={onClose}>
      {/* Sized to the physical screen: see side-drawer.tsx — RN's Modal under
          edge-to-edge otherwise ends short of the bottom. */}
      <View style={[styles.overlay, { height: Dimensions.get('screen').height }]}>
        <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close editor" />
        </Animated.View>
        <Animated.View
          entering={SlideInDown.duration(240)}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, keyboard) + Space.md }]}>
          <View style={styles.head}>
            <Title style={styles.headTitle}>Edit todo</Title>
            <PressableScale onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
              <X size={16} color={Palette.text} />
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Field label="TITLE">
              <TextInput
                value={title}
                onChangeText={setTitle}
                style={styles.input}
                placeholder="What to do"
                placeholderTextColor={Palette.faint}
                selectionColor={accent}
                maxLength={200}
              />
            </Field>

            <Field label="PRIORITY">
              <Chips
                options={PRIORITIES}
                value={priority}
                accent={priority === 'must' ? Palette.alert : accent}
                onChange={(p) => {
                  tap();
                  setPriority(p);
                }}
              />
              <Meta style={styles.hint}>
                {priority === 'normal'
                  ? 'A notification with one sound.'
                  : priority === 'high'
                    ? 'An alarm over the lock screen; pokes once more after 30 min.'
                    : mode === 'repeat'
                      ? 'Once a day: done at any time closes the day. The last time cannot be skipped.'
                      : 'An alarm that keeps poking until it is done.'}
              </Meta>
            </Field>

            <Field label="WHEN">
              <Chips
                options={[
                  { value: 'anytime', label: 'Anytime' },
                  { value: 'once', label: 'Once' },
                  { value: 'repeat', label: 'Repeats' },
                ]}
                value={mode}
                accent={accent}
                onChange={(m: Mode) => {
                  tap();
                  setMode(m);
                }}
              />
            </Field>

            {mode === 'once' ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
                  {Array.from({ length: DAYS_AHEAD }, (_, i) => {
                    const d = startOfDay(new Date());
                    d.setDate(d.getDate() + i);
                    const label =
                      i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
                    return (
                      <Chip
                        key={i}
                        label={label}
                        on={dayOffset === i}
                        accent={accent}
                        onPress={() => {
                          tap();
                          setDayOffset(i);
                        }}
                      />
                    );
                  })}
                </ScrollView>
                <TimeStepper value={onceAt} accent={accent} onChange={setOnceAt} />
                {inPast ? <Meta style={styles.warn}>That time has already passed.</Meta> : null}
              </>
            ) : null}

            {mode === 'repeat' ? (
              <>
                <Chips
                  options={FREQS}
                  value={freq}
                  accent={accent}
                  onChange={(f) => {
                    tap();
                    setFreq(f);
                  }}
                />
                {freq === 'weekly' ? (
                  <View style={styles.weekRow}>
                    {DAY_LETTERS.map((letter, d) => {
                      const on = days.includes(d);
                      return (
                        <PressableScale
                          key={d}
                          onPress={() => {
                            tap();
                            setDays((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]));
                          }}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          style={[styles.weekDay, on && { backgroundColor: accent + '26', borderColor: accent }]}>
                          <Text style={[styles.weekDayText, on && { color: accent }]}>{letter}</Text>
                        </PressableScale>
                      );
                    })}
                  </View>
                ) : null}
                <View style={styles.times}>
                  {times.map((t, i) => (
                    <View key={i} style={styles.timeRow}>
                      <View style={styles.flex}>
                        <TimeStepper
                          value={t}
                          accent={accent}
                          onChange={(next) => setTimes((prev) => prev.map((x, j) => (j === i ? next : x)))}
                        />
                      </View>
                      {times.length > 1 ? (
                        <PressableScale
                          onPress={() => {
                            tap();
                            setTimes((prev) => prev.filter((_, j) => j !== i));
                          }}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${clock(hhmm(t))}`}
                          style={styles.removeTime}>
                          <X size={14} color={Palette.muted} />
                        </PressableScale>
                      ) : null}
                    </View>
                  ))}
                  {times.length < MAX_TIMES ? (
                    <PressableScale
                      onPress={() => {
                        tap();
                        setTimes((prev) => {
                          const last = prev[prev.length - 1] ?? nextHour();
                          return [...prev, { h: (last.h + 1) % 24, m: last.m }];
                        });
                      }}
                      accessibilityRole="button"
                      style={styles.addTime}>
                      <Plus size={14} color={accent} />
                      <Text style={[styles.addTimeText, { color: accent }]}>Add a time</Text>
                    </PressableScale>
                  ) : null}
                </View>
              </>
            ) : null}

            {problem ? <Meta style={styles.warn}>{problem}</Meta> : null}
          </ScrollView>

          <PressableScale
            onPress={() => void save()}
            disabled={saving}
            accessibilityRole="button"
            style={[styles.save, { backgroundColor: accent }, saving && styles.saving]}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
          </PressableScale>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Meta style={styles.label}>{label}</Meta>
      {children}
    </View>
  );
}

function Chip({ label, on, accent, onPress }: { label: string; on: boolean; accent: string; onPress: () => void }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={[styles.chip, on && { backgroundColor: accent + '26', borderColor: accent }]}>
      <Text style={[styles.chipText, on && { color: accent }]}>{label}</Text>
    </PressableScale>
  );
}

function Chips<T extends string>({
  options,
  value,
  accent,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  accent: string;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} on={o.value === value} accent={accent} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

/** "7:30 PM" with −/+ on the hour and on the minute (5-minute steps), and AM/PM. */
function TimeStepper({ value, accent, onChange }: { value: Clock; accent: string; onChange: (c: Clock) => void }) {
  const step = (next: Clock) => {
    void Haptics.selectionAsync();
    onChange(next);
  };
  // An odd minute (10:37 from a voice add) steps to the next multiple of 5, not by 5.
  const minuteUp = () => {
    const m = Math.floor(value.m / 5) * 5 + 5;
    step({ h: m >= 60 ? (value.h + 1) % 24 : value.h, m: m % 60 });
  };
  const minuteDown = () => {
    const m = value.m % 5 ? Math.floor(value.m / 5) * 5 : value.m - 5;
    step({ h: m < 0 ? (value.h + 23) % 24 : value.h, m: (m + 60) % 60 });
  };
  const pm = value.h >= 12;
  const hour12 = value.h % 12 || 12;
  return (
    <View style={styles.stepper}>
      <Spin label="hour" onDown={() => step({ ...value, h: (value.h + 23) % 24 })} onUp={() => step({ ...value, h: (value.h + 1) % 24 })}>
        <Text style={styles.clockText}>{hour12}</Text>
      </Spin>
      <Text style={styles.colon}>:</Text>
      <Spin label="minute" onDown={minuteDown} onUp={minuteUp}>
        <Text style={styles.clockText}>{String(value.m).padStart(2, '0')}</Text>
      </Spin>
      <View style={styles.meridiem}>
        {(['AM', 'PM'] as const).map((label) => {
          const on = (label === 'PM') === pm;
          return (
            <PressableScale
              key={label}
              onPress={() => !on && step({ ...value, h: (value.h + 12) % 24 })}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.meridiemButton, on && { backgroundColor: accent + '26' }]}>
              <Text style={[styles.meridiemText, on && { color: accent }]}>{label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function Spin({
  label,
  onDown,
  onUp,
  children,
}: {
  label: string;
  onDown: () => void;
  onUp: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.spin}>
      <PressableScale onPress={onDown} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Earlier ${label}`} style={styles.spinButton}>
        <Minus size={14} color={Palette.muted} />
      </PressableScale>
      {children}
      <PressableScale onPress={onUp} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Later ${label}`} style={styles.spinButton}>
        <Plus size={14} color={Palette.muted} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: Palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: Palette.hairline,
    paddingTop: Space.lg,
    paddingHorizontal: Space.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Space.md },
  headTitle: { fontSize: 20 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Palette.surfaceLift,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { gap: Space.lg, paddingBottom: Space.lg },
  field: { gap: Space.sm },
  label: { fontSize: 10, letterSpacing: 1.2, color: Palette.faint },
  hint: { color: Palette.muted, fontSize: 12 },
  warn: { color: Palette.alert, fontSize: 13 },
  input: {
    fontFamily: Font.ui,
    fontSize: 16,
    color: Palette.text,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 12,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  chip: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm - 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.surfaceGlass,
  },
  chipText: { fontFamily: Font.uiMedium, fontSize: 13, color: Palette.muted },
  dayStrip: { gap: Space.sm },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: Palette.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayText: { fontFamily: Font.uiMedium, fontSize: 13, color: Palette.muted },
  times: { gap: Space.sm },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  flex: { flex: 1 },
  removeTime: { padding: Space.xs },
  addTime: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingVertical: Space.xs },
  addTimeText: { fontFamily: Font.uiMedium, fontSize: 13 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    padding: Space.sm,
    borderRadius: 12,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  spin: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  spinButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Palette.surfaceLift,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockText: { fontFamily: Font.uiMedium, fontSize: 20, color: Palette.text, minWidth: 28, textAlign: 'center' },
  colon: { fontFamily: Font.uiMedium, fontSize: 20, color: Palette.muted },
  meridiem: { flexDirection: 'row', marginLeft: 'auto', borderRadius: 10, overflow: 'hidden' },
  meridiemButton: { paddingHorizontal: Space.sm, paddingVertical: Space.xs + 2 },
  meridiemText: { fontFamily: Font.uiMedium, fontSize: 12, color: Palette.muted },
  save: { borderRadius: 24, paddingVertical: Space.md, alignItems: 'center', marginTop: Space.xs },
  saving: { opacity: 0.6 },
  saveText: { fontFamily: Font.uiMedium, fontSize: 15, color: Palette.ground },
});

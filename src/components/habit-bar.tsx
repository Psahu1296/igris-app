import { Flame, Snowflake, Trophy } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Meta } from '@/components/typography';
import { Font, Palette, Space } from '@/constants/theme';
import type { Habit } from '@/lib/prep';

/**
 * The habit bar on top of Prep (maestro prep/habit.py). Streak first — the strongest
 * single lever there is — then today's goal, kept separate from it, then where he is
 * going. A flame that isn't lit yet today says so: the nudge is "one card keeps it".
 */
export function HabitBar({ habit, accent }: { habit: Habit; accent: string }) {
  const lit = habit.done_today;
  const goalHit = habit.today_xp >= habit.goal;
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.streak}>
          <Flame size={30} color={lit ? Palette.local : Palette.faint} fill={lit ? Palette.local : 'transparent'} />
          <View>
            <Text style={[styles.big, { color: lit ? Palette.local : Palette.text }]}>{habit.streak}</Text>
            <Meta style={styles.small}>{habit.streak === 1 ? 'day streak' : 'day streak'}</Meta>
          </View>
        </View>
        <View style={styles.freezes}>
          {Array.from({ length: habit.freezes }, (_, n) => (
            <Snowflake key={n} size={16} color={Palette.cloud} />
          ))}
        </View>
        <View style={styles.rankChip}>
          <Trophy size={14} color={accent} />
          <Text style={[styles.rankText, { color: accent }]}>{habit.rank}</Text>
        </View>
      </View>

      {!lit ? (
        <Meta style={[styles.small, { color: Palette.local }]}>
          {habit.streak > 0 ? 'Not lit today. One card keeps the streak alive.' : 'One card starts a streak.'}
        </Meta>
      ) : null}

      <View style={styles.week}>
        {habit.week.map((d, n) => {
          const today = n === habit.week.length - 1;
          const did = d.xp > 0;
          return (
            <View key={d.day} style={styles.dayCol}>
              <View
                style={[
                  styles.dot,
                  did && { backgroundColor: Palette.local, borderColor: Palette.local },
                  d.frozen && { borderColor: Palette.cloud },
                  today && !did && { borderColor: Palette.local, borderStyle: 'dashed' },
                ]}>
                {d.frozen ? <Snowflake size={10} color={Palette.cloud} /> : null}
              </View>
              <Meta style={styles.dayLetter}>
                {new Date(`${d.day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'narrow' })}
              </Meta>
            </View>
          );
        })}
      </View>

      <View style={styles.goal}>
        <View style={styles.rowBetween}>
          <Meta style={styles.label}>{goalHit ? 'DAILY GOAL HIT ✓' : 'DAILY GOAL'}</Meta>
          <Meta style={styles.small}>{`${habit.today_xp} / ${habit.goal} XP`}</Meta>
        </View>
        <Bar value={habit.today_xp / habit.goal} color={goalHit ? Palette.auto : Palette.local} />
      </View>

      <View style={styles.goal}>
        <View style={styles.rowBetween}>
          <Meta style={styles.label}>{`LEVEL ${habit.level} · ${habit.total_xp} XP`}</Meta>
          <Meta style={styles.small}>{habit.next ? `${habit.to_next} XP to ${habit.next}` : 'Top rank'}</Meta>
        </View>
        <Bar value={habit.progress} color={accent} />
      </View>
    </View>
  );
}

export function Bar({ value, color }: { value: number; color: string }) {
  return (
    <View style={styles.track}>
      <View style={[styles.bar, { width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Space.md,
    padding: Space.lg,
    borderRadius: 16,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  big: { fontFamily: Font.voiceMedium, fontSize: 30, lineHeight: 32 },
  small: { color: Palette.muted, fontSize: 12 },
  freezes: { flexDirection: 'row', gap: 2, flex: 1 },
  rankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: Palette.surfaceLift,
  },
  rankText: { fontFamily: Font.uiMedium, fontSize: 13 },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: 4 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Palette.hairlineBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLetter: { fontSize: 10, color: Palette.faint },
  goal: { gap: 6 },
  label: { fontSize: 10, letterSpacing: 1.2, color: Palette.faint },
  track: { height: 6, borderRadius: 3, backgroundColor: Palette.surfaceLift, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
});

import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  GraduationCap,
  Mic,
  Play,
  Square,
  Star,
  Terminal,
  X,
} from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HabitBar } from '@/components/habit-bar';
import { Markdown } from '@/components/markdown';
import { PressableScale } from '@/components/pressable-scale';
import { PythonPractice } from '@/components/python-practice';
import { Answer, Meta, Title } from '@/components/typography';
import { Font, Gutter, laneColor, Palette, Space } from '@/constants/theme';
import {
  answerQuestion,
  dayLabel,
  nextQuestions,
  prepDay,
  prepHabit,
  prepReport,
  PrepUnavailable,
  shiftDay,
  skipQuestion,
  tickTask,
  type Habit,
  type PrepDay,
  type PrepGrade,
  type PrepQuestion,
  type PrepReport,
  type PrepTask,
} from '@/lib/prep';
import { useListening } from '@/lib/voice/use-listening';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import { useSession } from '@/state/session';

/**
 * Interview prep: the day's plan and the question bank (lib/prep.ts → maestro /prep).
 *
 * Same store as Claude Code's /interview-prep on the Mac, so studying moves between
 * the desk and the phone without losing a tick or a score. A quiz task in the plan is a
 * Start button; finishing its questions ticks it. Answers are typed or spoken (the mic
 * is the composer's: Whisper on the Mac, the phone's recogniser otherwise) — spoken is
 * the point, interviews are out loud.
 */

type Quiz = {
  questions: PrepQuestion[];
  i: number;
  scores: number[];
  /** The plan task this quiz ticks when finished, and its day. */
  task: { day: string; key: string } | null;
};

type Result = PrepGrade | { skipped: true; model_answer: string };

export default function Prep() {
  const { lane, lanePref, laneReachable } = useSession();
  const accent = laneColor(lanePref);
  const [day, setDay] = useState<string | null>(null);
  const [plan, setPlan] = useState<PrepDay | null>(null);
  const [report, setReport] = useState<PrepReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [habit, setHabit] = useState<Habit | null>(null);
  const [python, setPython] = useState(false);

  const load = useCallback(
    async (on: string | null = day) => {
      try {
        const [p, r, h] = await Promise.all([prepDay(lane, on ?? undefined), prepReport(lane), prepHabit(lane)]);
        setPlan(p);
        setReport(r);
        setHabit(h);
        setError(null);
      } catch (err) {
        if (err instanceof PrepUnavailable) setUnavailable(true);
        setError(err instanceof Error ? err.message : 'Could not load prep.');
      }
    },
    [lane, day]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const move = (by: number) => {
    if (!plan) return;
    const next = shiftDay(plan.day, by);
    if (next < plan.first || next > plan.last) return;
    void Haptics.selectionAsync();
    setDay(next);
    void load(next);
  };

  const toggle = async (task: PrepTask) => {
    if (!plan) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Optimistic, like the Todos list: a failure puts it back.
    const flip = (done: boolean) =>
      setPlan((p) => p && { ...p, tasks: p.tasks.map((t) => (t.key === task.key ? { ...t, done } : t)) });
    flip(!task.done);
    try {
      await tickTask(lane, plan.day, task.key, !task.done);
    } catch (err) {
      flip(task.done);
      setError(err instanceof Error ? err.message : 'That did not go through.');
    }
  };

  const startQuiz = async (section: string | null, n: number, task: PrepTask | null) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const questions = await nextQuestions(lane, n, section);
      if (questions.length === 0) {
        setError('No questions left in that section.');
        return;
      }
      setQuiz({ questions, i: 0, scores: [], task: task && plan ? { day: plan.day, key: task.key } : null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the quiz.');
    }
  };

  const finishQuiz = async () => {
    const task = quiz?.task;
    setQuiz(null);
    if (task) await tickTask(lane, task.day, task.key, true).catch(() => {});
    await load();
  };

  if (python) {
    return (
      <PythonPractice
        lane={lane}
        accent={accent}
        habit={habit}
        onClose={(h) => {
          setPython(false);
          if (h) setHabit(h);
          void load();
        }}
      />
    );
  }

  if (quiz) {
    return (
      <QuizView
        quiz={quiz}
        accent={accent}
        lane={lane}
        macReachable={laneReachable}
        onScore={(score) => setQuiz((q) => q && { ...q, scores: [...q.scores, score] })}
        onNext={() => setQuiz((q) => q && { ...q, i: q.i + 1 })}
        onClose={() => void finishQuiz()}
      />
    );
  }

  const done = plan ? plan.tasks.filter((t) => t.done).length : 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header title="Prep" accent={accent} onClose={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={accent}
            colors={[accent]}
            progressBackgroundColor={Palette.surface}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }>
        {error ? <Meta style={styles.error}>{error}</Meta> : null}
        {unavailable ? null : !plan ? (
          <ActivityIndicator color={accent} />
        ) : (
          <>
            {habit ? <HabitBar habit={habit} accent={accent} /> : null}

            <PressableScale
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setPython(true);
              }}
              accessibilityRole="button"
              style={[styles.pyButton, { backgroundColor: accent }]}>
              <Terminal size={18} color={Palette.ground} />
              <Text style={styles.pyText}>
                {habit && !habit.done_today ? 'Python practice · keep the streak' : 'Python practice'}
              </Text>
            </PressableScale>

            <View style={styles.readiness}>
              <View style={styles.rowBetween}>
                <Meta style={styles.sectionTitle}>INTERVIEW READINESS</Meta>
                <Meta style={styles.when}>
                  {report ? `${report.seen} of ${report.total} seen · ${report.due} due` : ''}
                </Meta>
              </View>
              <Text style={[styles.big, { color: plan.readiness < 40 ? Palette.alert : accent }]}>
                {`${plan.readiness}%`}
              </Text>
              <Bar value={plan.readiness / 100} color={plan.readiness < 40 ? Palette.alert : accent} />
            </View>

            <View style={styles.dayNav}>
              <PressableScale onPress={() => move(-1)} hitSlop={12} accessibilityLabel="Previous day">
                <ChevronLeft size={22} color={plan.day > plan.first ? Palette.text : Palette.faint} />
              </PressableScale>
              <View style={styles.dayTitle}>
                <Answer style={styles.dayText}>{dayLabel(plan.day)}</Answer>
                <Meta style={styles.when}>{plan.week ?? 'Outside the plan'}</Meta>
              </View>
              <PressableScale onPress={() => move(1)} hitSlop={12} accessibilityLabel="Next day">
                <ChevronRight size={22} color={plan.day < plan.last ? Palette.text : Palette.faint} />
              </PressableScale>
            </View>

            <View style={styles.section}>
              <Meta style={styles.sectionTitle}>{`TASKS · ${done} OF ${plan.tasks.length} DONE`}</Meta>
              {plan.tasks.map((t) => (
                <TaskRow
                  key={t.key}
                  task={t}
                  accent={accent}
                  onToggle={() => void toggle(t)}
                  onStart={t.quiz ? () => void startQuiz(t.quiz!.section, t.quiz!.n, t) : undefined}
                />
              ))}
            </View>

            <PressableScale
              onPress={() => void startQuiz(null, 5, null)}
              accessibilityRole="button"
              style={[styles.quickQuiz, { borderColor: accent + '55' }]}>
              <Play size={16} color={accent} />
              <Text style={[styles.quickText, { color: accent }]}>Quick quiz · 5 mixed questions</Text>
            </PressableScale>

            {report ? <Sections report={report} accent={accent} onStart={(s) => void startQuiz(s, 5, null)} /> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Header({ title, accent, onClose }: { title: string; accent: string; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTitleGroup}>
        <GraduationCap size={20} color={accent} />
        <Title style={styles.headerTitle}>{title}</Title>
      </View>
      <PressableScale
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onClose();
        }}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={styles.backButton}>
        <X size={18} color={Palette.text} />
      </PressableScale>
    </View>
  );
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <View style={styles.track}>
      <View style={[styles.bar, { width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

function TaskRow({
  task,
  accent,
  onToggle,
  onStart,
}: {
  task: PrepTask;
  accent: string;
  onToggle: () => void;
  onStart?: () => void;
}) {
  return (
    <View style={styles.row}>
      <PressableScale
        onPress={onToggle}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.done }}
        accessibilityLabel={task.text}>
        {task.done ? <CheckCircle2 size={22} color={accent} /> : <Circle size={22} color={Palette.muted} />}
      </PressableScale>
      <Text style={[styles.taskText, task.done && styles.taskDone]}>{task.text}</Text>
      {onStart && !task.done ? (
        <PressableScale onPress={onStart} accessibilityRole="button" style={[styles.start, { backgroundColor: accent }]}>
          <Text style={styles.startText}>Start</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

/** Each section's average latest score out of 5; tap one for 5 questions from it. */
function Sections({ report, accent, onStart }: { report: PrepReport; accent: string; onStart: (s: string) => void }) {
  return (
    <View style={styles.section}>
      <Meta style={styles.sectionTitle}>SECTIONS</Meta>
      {report.sections.map((s) => (
        <PressableScale key={s.section} onPress={() => onStart(s.section)} accessibilityRole="button" style={styles.topic}>
          <View style={styles.rowBetween}>
            <Text style={styles.topicTitle} numberOfLines={1}>{`${s.section} · ${s.title}`}</Text>
            <Meta style={styles.when}>
              {s.score === null ? `${s.total} new` : `${s.score.toFixed(1)} / 5 · ${s.seen}/${s.total}`}
            </Meta>
          </View>
          <Bar
            value={((s.score ?? 1) - 1) / 4 * (s.seen / s.total)}
            color={s.score !== null && s.score < 3 ? Palette.alert : accent}
          />
        </PressableScale>
      ))}
    </View>
  );
}

function QuizView({
  quiz,
  accent,
  lane,
  macReachable,
  onScore,
  onNext,
  onClose,
}: {
  quiz: Quiz;
  accent: string;
  lane: ReturnType<typeof useSession>['lane'];
  macReachable: boolean;
  onScore: (score: number) => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listening = useListening(lane, macReachable);
  const keyboard = useKeyboardInset();
  const finished = quiz.i >= quiz.questions.length;
  const q = quiz.questions[quiz.i];

  const submit = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const g = await answerQuestion(lane, q.id, draft.trim());
      void Haptics.notificationAsync(
        g.score >= 4 ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
      );
      setResult(g);
      onScore(g.score);
    } catch (err) {
      // The answer stays in the box: grading failed, the words did not.
      setError(err instanceof Error ? err.message : 'Grading failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    try {
      setResult({ skipped: true, model_answer: await skipQuestion(lane, q.id) });
      onScore(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not skip.');
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    setDraft('');
    setResult(null);
    setError(null);
    onNext();
  };

  // Each utterance is added to the answer: the recogniser stops at a pause, and a long
  // interview answer has several.
  const talk = () => {
    if (listening.state !== 'idle') return void listening.stop();
    void listening.start((text) => setDraft((d) => (d ? `${d} ${text}` : text)));
  };

  if (finished) {
    const avg = quiz.scores.reduce((a, b) => a + b, 0) / Math.max(1, quiz.scores.length);
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Header title="Quiz done" accent={accent} onClose={onClose} />
        <View style={styles.content}>
          <Text style={[styles.big, { color: avg < 3 ? Palette.alert : accent }]}>{`${avg.toFixed(1)} / 5`}</Text>
          <Answer style={styles.lede}>
            {`${quiz.scores.length} answered. Anything under 3 comes back tomorrow; the rest climbs the 1/3/7/21/60-day ladder.`}
          </Answer>
          <PressableScale onPress={onClose} style={[styles.primary, { backgroundColor: accent }]}>
            <Text style={styles.primaryText}>{quiz.task ? 'Done · tick the task' : 'Done'}</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <Header title={`Question ${quiz.i + 1} of ${quiz.questions.length}`} accent={accent} onClose={onClose} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Space.xl + keyboard }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.qHead}>
          <Meta style={styles.sectionTitle}>{`SECTION ${q.section} · Q${q.id}`}</Meta>
          {q.star ? <Star size={14} color={Palette.local} fill={Palette.local} /> : null}
          {q.last !== null ? <Meta style={styles.when}>{`last ${q.last}/5`}</Meta> : null}
        </View>
        <Text style={styles.question}>{q.question}</Text>

        {!result ? (
          <>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              placeholder="Answer as you would in the interview. Tap the mic to say it."
              placeholderTextColor={Palette.faint}
              style={styles.input}
              editable={!busy}
            />
            {error ? <Meta style={styles.error}>{error}</Meta> : null}
            <View style={styles.actions}>
              {listening.available ? (
                <PressableScale
                  onPress={talk}
                  accessibilityRole="button"
                  accessibilityLabel={listening.state === 'idle' ? 'Speak your answer' : 'Stop listening'}
                  style={[styles.mic, { borderColor: accent }]}>
                  {listening.state === 'idle' ? (
                    <Mic size={20} color={accent} />
                  ) : listening.state === 'listening' ? (
                    <Square size={18} color={Palette.alert} fill={Palette.alert} />
                  ) : (
                    <ActivityIndicator color={accent} />
                  )}
                </PressableScale>
              ) : null}
              <PressableScale onPress={() => void skip()} disabled={busy} style={styles.secondary}>
                <Text style={styles.secondaryText}>Skip</Text>
              </PressableScale>
              <PressableScale
                onPress={() => void submit()}
                disabled={busy || !draft.trim()}
                style={[styles.primary, styles.grow, { backgroundColor: draft.trim() ? accent : Palette.surfaceLift }]}>
                {busy ? <ActivityIndicator color={Palette.ground} /> : <Text style={styles.primaryText}>Grade it</Text>}
              </PressableScale>
            </View>
          </>
        ) : (
          <ResultView result={result} accent={accent} />
        )}

        {result ? (
          <PressableScale onPress={next} style={[styles.primary, { backgroundColor: accent }]}>
            <Text style={styles.primaryText}>
              {quiz.i + 1 < quiz.questions.length ? 'Next question' : 'See the score'}
            </Text>
          </PressableScale>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ResultView({ result, accent }: { result: Result; accent: string }) {
  return (
    <View style={styles.result}>
      {'skipped' in result ? (
        <Meta style={styles.when}>Skipped · counted as 1/5, back tomorrow.</Meta>
      ) : (
        <>
          <Text style={[styles.score, { color: result.score < 3 ? Palette.alert : accent }]}>
            {`${result.score} / 5`}
          </Text>
          {result.right ? <Answer style={styles.line}>{`✅ ${result.right}`}</Answer> : null}
          {result.missing ? <Answer style={styles.line}>{`❌ ${result.missing}`}</Answer> : null}
          {result.say_it ? (
            <View style={styles.sayIt}>
              <Meta style={styles.sectionTitle}>SAY IT LIKE THIS</Meta>
              <Answer style={styles.line}>{result.say_it}</Answer>
            </View>
          ) : null}
        </>
      )}
      <View style={styles.sayIt}>
        <Meta style={styles.sectionTitle}>MODEL ANSWER</Meta>
        <Markdown text={result.model_answer} accent={accent} />
      </View>
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
  headerTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
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
  content: { paddingHorizontal: Gutter, paddingTop: Space.lg, paddingBottom: Space.xl, gap: Space.lg },
  lede: { color: Palette.muted, fontSize: 15, lineHeight: 22 },
  error: { color: Palette.alert, fontSize: 13 },
  section: { gap: Space.xs },
  sectionTitle: { fontSize: 10, letterSpacing: 1.2, color: Palette.faint },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.sm },
  when: { color: Palette.muted, fontSize: 12 },
  readiness: { gap: Space.xs },
  big: { fontFamily: Font.voiceMedium, fontSize: 40 },
  track: { height: 4, borderRadius: 2, backgroundColor: Palette.surfaceLift, overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2 },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayTitle: { alignItems: 'center', gap: 2, flex: 1 },
  dayText: { fontSize: 17, color: Palette.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.md,
    borderRadius: 12,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  taskText: { flex: 1, fontFamily: Font.ui, color: Palette.text, fontSize: 14, lineHeight: 20 },
  taskDone: { color: Palette.faint, textDecorationLine: 'line-through' },
  start: { paddingHorizontal: Space.md, paddingVertical: 6, borderRadius: 14 },
  startText: { fontFamily: Font.uiMedium, color: Palette.ground, fontSize: 13 },
  quickQuiz: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    padding: Space.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  quickText: { fontFamily: Font.uiMedium, fontSize: 14 },
  pyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
    height: 52,
    borderRadius: 14,
  },
  pyText: { fontFamily: Font.uiMedium, color: Palette.ground, fontSize: 15 },
  topic: { gap: 6, paddingVertical: Space.xs },
  topicTitle: { flex: 1, fontFamily: Font.ui, color: Palette.text, fontSize: 14 },
  qHead: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  question: { fontFamily: Font.voiceMedium, color: Palette.text, fontSize: 20, lineHeight: 28 },
  input: {
    minHeight: 140,
    padding: Space.md,
    borderRadius: 12,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
    color: Palette.text,
    fontFamily: Font.ui,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  mic: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    height: 48,
    paddingHorizontal: Space.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surfaceLift,
  },
  secondaryText: { fontFamily: Font.uiMedium, color: Palette.muted, fontSize: 14 },
  primary: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Space.lg },
  primaryText: { fontFamily: Font.uiMedium, color: Palette.ground, fontSize: 15 },
  grow: { flex: 1 },
  result: { gap: Space.md },
  score: { fontFamily: Font.voiceMedium, fontSize: 32 },
  line: { color: Palette.text, fontSize: 15, lineHeight: 22 },
  sayIt: {
    gap: Space.xs,
    padding: Space.md,
    borderRadius: 12,
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
});

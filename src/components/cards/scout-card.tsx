import * as Haptics from 'expo-haptics';
import { BookOpen, FileText, SearchCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, ToastAndroid, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Meta } from '@/components/typography';
import { Palette, Space } from '@/constants/theme';
import type { Lane } from '@/lib/config';
import { isPlan, openPaper, scoutJobs, type ScoutJob, type ScoutPaper } from '@/lib/scout';

import { shared } from './styles';

/**
 * On the turn that started a Scout job, while it runs. use-conversation's watcher
 * clears the turn's `scout` when the job ends and adds the report turn below it.
 */
export function ScoutPending({ accent }: { accent: string }) {
  return (
    <View style={[shared.callCard, styles.row, { borderColor: accent + '33' }]}>
      <ActivityIndicator size="small" color={accent} />
      <Meta style={styles.note}>The scout is out. Its report will appear below; keep talking.</Meta>
    </View>
  );
}

/**
 * A Scout job's files on the report turn: papers, each downloaded and checked on the Mac
 * (maestro scout/), and for an exam_plan job the study plan page first (maestro
 * research/). Loaded by id, so a reopened conversation shows it too.
 */
export function ScoutCard({ lane, jobId, accent }: { lane: Lane; jobId: string; accent: string }) {
  const [job, setJob] = useState<ScoutJob | null | 'missing'>(null);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    scoutJobs(lane)
      .then((jobs) => live && setJob(jobs.find((j) => j.id === jobId) ?? 'missing'))
      .catch(() => live && setJob('missing'));
    return () => {
      live = false;
    };
  }, [lane, jobId]);

  if (job === 'missing') {
    return <Meta style={styles.note}>The scout&apos;s papers are on the Mac and could not be loaded.</Meta>;
  }
  if (!job || !job.found.length) return null;

  const open = async (file: string) => {
    if (opening) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpening(file);
    try {
      await openPaper(lane, job.id, file);
    } catch (err) {
      ToastAndroid.show(err instanceof Error ? err.message : 'Could not open that paper.', ToastAndroid.SHORT);
    } finally {
      setOpening(null);
    }
  };

  return (
    <View style={[shared.callCard, { borderColor: accent + '33' }]}>
      <View style={shared.chatHead}>
        <SearchCheck size={14} color={accent} />
        <Text style={shared.chatTitle}>{`${job.exam} ${job.kind === 'exam_plan' ? 'plan' : 'papers'}`}</Text>
      </View>
      {[...job.found].sort((a, b) => Number(isPlan(b.file)) - Number(isPlan(a.file))).map((paper) => (
        <PressableScale
          key={paper.file}
          onPress={() => void open(paper.file)}
          accessibilityRole="button"
          accessibilityLabel={isPlan(paper.file) ? `Open the ${paper.exam} study plan` : `Open the ${paper.exam} ${paper.year} paper`}
          style={styles.row}>
          {isPlan(paper.file) ? <BookOpen size={18} color={accent} /> : <FileText size={18} color={accent} />}
          <View style={shared.callWho}>
            <Text style={shared.callName}>{titleOf(paper, job.exam)}</Text>
            <Text style={shared.callNumber} numberOfLines={1}>
              {paper.url ? `${paper.why} · ${hostOf(paper.url)}` : paper.why}
            </Text>
          </View>
          {opening === paper.file ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Meta style={[shared.actionText, { color: accent }]}>Open</Meta>
          )}
        </PressableScale>
      ))}
      {job.rejected ? (
        <Meta style={styles.note}>{`${job.rejected} other file${job.rejected === 1 ? '' : 's'} failed the checks.`}</Meta>
      ) : null}
    </View>
  );
}

const titleOf = (paper: ScoutPaper, exam: string) =>
  isPlan(paper.file) ? 'Study plan' : paper.exam === exam ? String(paper.year) : `${paper.exam} ${paper.year}`;

const hostOf = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.xs,
  },
  note: {
    color: Palette.muted,
    fontSize: 12,
  },
});

import * as Haptics from 'expo-haptics';
import { FileText, SearchCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, ToastAndroid, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { Meta } from '@/components/typography';
import { Palette, Space } from '@/constants/theme';
import type { Lane } from '@/lib/config';
import { openPaper, scoutJobs, type ScoutJob } from '@/lib/scout';

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
 * A Scout job's papers, each one downloaded and checked on the Mac (maestro scout/),
 * on the report turn. Loaded by id, so a reopened conversation shows it too.
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
        <Text style={shared.chatTitle}>{`${job.exam} papers`}</Text>
      </View>
      {job.found.map((paper) => (
        <PressableScale
          key={paper.file}
          onPress={() => void open(paper.file)}
          accessibilityRole="button"
          accessibilityLabel={`Open the ${paper.exam} ${paper.year} paper`}
          style={styles.row}>
          <FileText size={18} color={accent} />
          <View style={shared.callWho}>
            <Text style={shared.callName}>{paper.exam === job.exam ? paper.year : `${paper.exam} ${paper.year}`}</Text>
            <Text style={shared.callNumber} numberOfLines={1}>
              {`${paper.why} · ${hostOf(paper.url)}`}
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

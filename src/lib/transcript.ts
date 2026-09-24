import type { TurnState } from '@/components/turn';
import { describeAction } from '@/lib/device';

/**
 * The whole conversation as text, for pasting into an eval set, a prompt review, or
 * another model to critique Igris's answers.
 *
 * Markdown rather than JSON: the first reader is usually a person or an LLM, and both
 * read this directly. Every turn carries a stable number, so a note like "turn 4
 * hallucinated the date" can point at something.
 *
 * Two rules keep it trustworthy as training material:
 *
 * - FAILURES STAY IN. A turn that errored or never answered is the most useful line
 *   in the file for sharpening the model, so it is kept and labelled, never skipped.
 * - ONLY MEASURED FACTS. Which brain answered and how long it took are printed only
 *   for turns this app timed live. Turns restored from history are tagged with the
 *   lane they were *fetched* from, which is not evidence of who answered them, so
 *   their metadata is left out rather than guessed.
 */
export function formatTranscript(turns: TurnState[], sessionId: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const lines = [
    '# Igris conversation',
    '',
    `Thread: ${sessionId} · Exported ${stamp} UTC · ${turns.length} turn${turns.length === 1 ? '' : 's'}`,
  ];

  turns.forEach((turn, index) => {
    const measured =
      turn.elapsedMs !== null
        ? ` · ${turn.lane === 'local' ? 'Mac' : 'Render'} · ${(turn.elapsedMs / 1000).toFixed(1)}s`
        : '';

    lines.push('', `## Turn ${index + 1}${measured}`, '', `**You:** ${turn.ask}`, '');

    // What Igris did on the phone, and whether the phone agreed — a spoken "setting an
    // alarm" with a failed action underneath is exactly the case worth reviewing.
    if (turn.device) {
      const { action, status, detail } = turn.device;
      lines.push(`_Device: ${describeAction(action)} — ${status}${detail ? ` (${detail})` : ''}_`, '');
    }

    if (turn.answer) {
      lines.push(`**Igris:** ${turn.answer}`);
    } else if (turn.error) {
      lines.push(`**Igris:** _(failed — ${turn.error})_`);
    } else if (turn.status) {
      lines.push(`**Igris:** _(still answering when copied — ${turn.status})_`);
    } else {
      lines.push('**Igris:** _(no answer recorded)_');
    }
  });

  return lines.join('\n') + '\n';
}

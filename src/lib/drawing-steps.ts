import type { DrawProgress } from '@/lib/maestro';

/**
 * What to say while a picture is drawn, one line per stretch of the work, so a two-minute
 * HD picture reads as a painter at work rather than a bar crawling (the owner's idea,
 * 2026-09-29). maestro streams mflux's real denoising steps (`progress` frames, imagine.py);
 * the line is picked by how far along it is, not by step number, so the same nine lines
 * fit a 9-step HD picture, a 4-step klein one and an edit.
 */
const LINES = [
  'Sketching the outline…',
  'Blocking in the big shapes…',
  'Laying down the light…',
  'Mixing the colours…',
  'Painting the details…',
  'Adding texture and shadow…',
  'Sharpening the edges…',
  'Final touches…',
  'Signing the canvas…',
];

/** Before the first step arrives the model is still loading (~20 s for Z-Image). */
const SETTING_UP = 'Setting up the easel…';

/**
 * Steps 1…total-1 walk the first eight lines; the last step (then mflux decodes the image
 * and maestro makes a JPEG) is the last line. With 9 steps each line shows once.
 */
export function drawingLine(progress: DrawProgress | null | undefined): string {
  if (!progress || progress.total <= 0 || progress.done <= 0) return SETTING_UP;
  const last = LINES.length - 1;
  if (progress.done >= progress.total) return LINES[last];
  const span = Math.max(1, progress.total - 1);
  return LINES[Math.min(last - 1, Math.floor(((progress.done - 1) / span) * last))];
}

/** 0..1 for the bar. */
export const drawingShare = (progress: DrawProgress | null | undefined): number =>
  progress && progress.total > 0 ? Math.min(1, Math.max(0, progress.done / progress.total)) : 0;

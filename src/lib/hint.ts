/**
 * Hint mode: a worked solution shown one step at a time, so the student tries the next
 * step before seeing it. Asked for in the words ("give me a hint", "one step at a
 * time", "ek ek step"); "next step" — typed, spoken or tapped — shows the next one.
 *
 * All on the phone: maestro sends the whole solution as usual, and the hiding is only a
 * cut of the Markdown after the Nth $$…$$ step. Revealing costs no network, works with
 * the Mac asleep, and a reopened conversation simply shows everything.
 */

const WANTS_HINT = /\b(hints?|clue|one step at a time|step by step,? (?:slowly|one by one)|ek ek step|thoda thoda)\b/i;
const NEXT = /^(?:ok(?:ay)?[,\s]+)?(?:next|next step|show (?:me )?(?:the )?next(?: step)?|another step|aage|agla(?: step)?|and then\??|then\??)\.?$/i;
const STEP = /\$\$[\s\S]+?\$\$/g;

export const wantsHint = (ask: string) => WANTS_HINT.test(ask);
export const isNext = (message: string) => NEXT.test(message.trim());

/** How many $$ steps an answer has. */
export const stepCount = (markdown: string) => (markdown.match(STEP) ?? []).length;

/**
 * The answer up to and including its `shown`-th step, and how many steps are still
 * hidden. The words before the first step (the method) always show; the final answer,
 * after the last step, shows only once every step has.
 */
export function revealed(markdown: string, shown: number): { text: string; hidden: number } {
  const steps = [...markdown.matchAll(STEP)];
  if (shown >= steps.length) return { text: markdown, hidden: 0 };
  const cut = steps[shown - 1];
  const end = cut ? cut.index! + cut[0].length : steps[0].index!;
  return { text: markdown.slice(0, end), hidden: steps.length - shown };
}

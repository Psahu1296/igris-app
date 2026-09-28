// The maths reader's cases (src/lib/math.ts, and hint mode in src/lib/hint.ts): what a formula shows as text and how it
// is said aloud. `node scripts/math-cases.mjs`; exits 1 on any miss. math.ts has no
// imports, so it is transpiled with the TypeScript already installed and run as-is.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
/** A dependency-free module from src/, transpiled and run as CommonJS. */
function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  new Function('exports', outputText)(exports);
  return exports;
}
const math = load('../src/lib/math.ts');

// [latex, text, speech]. The first ones are the owner's own questions (2026-09-28).
const CASES = [
  [String.raw`\sin^{-1}\left(\frac{1}{\sqrt{2}}\right)`, 'sin⁻¹(1/√2)', 'sine inverse of 1 over root 2'],
  [String.raw`\tan^{-1}\frac{1}{2} + \tan^{-1}\frac{1}{3} = \frac{\pi}{4}`, 'tan⁻¹ ½ + tan⁻¹ ⅓ = π/4',
    'tan inverse of 1 over 2 plus tan inverse of 1 over 3 equals pi over 4'],
  [String.raw`Sin^{-1}(1/2)`, 'sin⁻¹(1/2)', 'sine inverse of 1 over 2'],
  [String.raw`\alpha = 45^{\circ} = \frac{\pi}{4}`, 'α = 45° = π/4', 'alpha equals 45 degrees equals pi over 4'],
  [String.raw`1 - (1/2)(1/3)`, '1 − (1/2)(1/3)', '1 minus 1 over 2 times 1 over 3'],
  [String.raw`\sin^2\theta + \cos^2\theta = 1`, 'sin² θ + cos² θ = 1', 'sine squared theta plus cos squared theta equals 1'],
  [String.raw`\frac{\sin\theta}{1+\cos\theta} = 2\csc\theta`, '(sin θ)/(1 + cos θ) = 2cosec θ',
    'the fraction sine theta, over 1 plus cos theta, equals 2 cosec theta'],
  [String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`, 'x = (−b ± √(b² − 4ac))/2a',
    'X equals the fraction minus B plus or minus the square root of B squared minus 4 A C, end root, over 2 A'],
  [String.raw`\frac{dy}{dx} = 3x^2 - 2x`, 'dy/dx = 3x² − 2x', 'D Y by D X equals 3 X squared minus 2 X'],
  [String.raw`\lim_{x \to 0} \frac{\sin x}{x} = 1`, 'lim_(x → 0) (sin x)/x = 1',
    'the limit as X tends to 0, of the fraction sine X, over X, equals 1'],
  [String.raw`\log_2 8 = 3`, 'log₂ 8 = 3', 'log base 2 of 8 equals 3'],
  [String.raw`(1+\cos\theta)^2`, '(1 + cos θ)²', 'bracket 1 plus cos theta, close bracket squared'],
  [String.raw`\sqrt[3]{27} = 3`, '∛27 = 3', 'the cube root of 27 equals 3'],
  [String.raw`|x - 2| \le 5`, '|x − 2| ≤ 5', 'mod X minus 2, is less than or equal to 5'],
  // Lowercase h and u would be spoken as chat shorthand ("hai", "you"): capitals.
  [String.raw`h = ut + \frac{1}{2} g t^2`, 'h = ut + ½gt²', 'H equals U T plus 1 over 2 G T squared'],
  [String.raw`\frac{\frac{1}{2}}{3} + 1`, '(½)/3 + 1', 'the fraction 1 over 2, over 3, end fraction, plus 1'],
];

let failed = 0;
for (const [latex, text, speech] of CASES) {
  const gotText = math.mathToText(latex);
  const gotSpeech = math.mathToSpeech(latex);
  if (gotText !== text || gotSpeech !== speech) {
    failed++;
    console.log(`MISS ${latex}\n  text:   ${gotText}\n  want:   ${text}\n  speech: ${gotSpeech}\n  want:   ${speech}`);
  }
}
// Chemistry (\ce{}) and units.
const MORE = [
  [String.raw`\ce{2H2 + O2 -> 2H2O}`, '2H₂ + O₂ → 2H₂O', '2 H 2 plus O 2 gives 2 H 2 O'],
  [String.raw`\ce{NaCl(aq)}`, 'NaCl(aq)', 'N A C L aqueous'],
  [String.raw`\ce{Fe^{3+} + 3OH- -> Fe(OH)3}`, 'Fe³⁺ + 3OH⁻ → Fe(OH)₃', 'F E 3 plus plus 3 O H minus gives F E O H 3'],
  [String.raw`v = 20\,\text{km/h}`, 'v = 20 km/h', 'V equals 20 kilometres per hour'],
];
for (const [latex, text, speech] of MORE) {
  const gotText = math.mathToText(latex);
  const gotSpeech = math.mathToSpeech(latex);
  if (gotText !== text || gotSpeech !== speech) {
    failed++;
    console.log(`MISS ${latex}\n  text:   ${gotText}\n  want:   ${text}\n  speech: ${gotSpeech}\n  want:   ${speech}`);
  }
}
const UNITS = [
  ['The ball falls at 9.8 m/s^2 for 3 s.', 'The ball falls at 9.8 metres per second squared for 3 seconds.'],
  ['It runs 60 km/h, weighs 2 kg and is at 25 °C.', 'It runs 60 kilometres per hour, weighs 2 kilograms and is at 25 degrees Celsius.'],
  ['Option A is 5 marks.', 'Option A is 5 marks.'],
];
for (const [text, want] of UNITS) {
  const got = math.speakUnits(text);
  if (got !== want) {
    failed++;
    console.log(`MISS units ${text}\n  got:  ${got}\n  want: ${want}`);
  }
}
CASES.push(...MORE, ...UNITS); // counted in the total

// An aligned block comes apart into one spoken line per row.
const rows = math.mathToSpeechLines(String.raw`\begin{aligned} a &= b + c \\ &= 5 \end{aligned}`);
if (JSON.stringify(rows) !== JSON.stringify(['A equals B plus C', 'equals 5'])) {
  failed++;
  console.log(`MISS aligned rows: ${JSON.stringify(rows)}`);
}
// Hint mode (src/lib/hint.ts): what shows after N steps, and the words that ask for it.
const hint = load('../src/lib/hint.ts');
const solved = 'Use the formula.\n$$a = b$$\n$$= c$$\nSo\n$$= d$$\n**d**';
const HINTS = [
  [hint.revealed(solved, 1), { text: 'Use the formula.\n$$a = b$$', hidden: 2 }],
  [hint.revealed(solved, 2), { text: 'Use the formula.\n$$a = b$$\n$$= c$$', hidden: 1 }],
  [hint.revealed(solved, 3), { text: solved, hidden: 0 }],
  [['give me a hint', 'one step at a time', 'ek ek step batao', 'solve this'].map(hint.wantsHint), [true, true, true, false]],
  [['next', 'Next step', 'ok next', 'aage', 'next question please'].map(hint.isNext), [true, true, true, true, false]],
];
for (const [got, want] of HINTS) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failed++;
    console.log(`MISS hint\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
  }
}
CASES.push(...HINTS);

console.log(`${CASES.length + 1 - failed}/${CASES.length + 1} math cases`);
process.exit(failed ? 1 : 0);

/**
 * Maths in Igris's answers: LaTeX read into a small tree, then written out two ways —
 * as Unicode for a formula inside a sentence (sin²θ, √3, ½), and as words for the
 * voice ("sine squared theta", "the fraction sine theta, over 1 plus cos theta").
 * Display steps ($$…$$) are drawn by KaTeX instead (components/math-block.tsx); this
 * is their voice and their offline fallback.
 *
 * Hand-written, not a library, for the same reason as markdown.ts. The standard
 * maths-to-speech engine (Speech Rule Engine, behind MathJax) is megabytes of rule
 * files built for a browser; it would only run inside the WebView, so speech would
 * need a drawn card and a network. What Igris writes is school maths: fractions,
 * roots, powers, trig, Greek letters, relations. A trig answer read aloud brace by
 * brace (2026-09-28) is what this is for.
 *
 * Pure and dependency-free, so a case table can run it under plain Node
 * (scripts/math-cases.mjs).
 */

type Node =
  | { k: 'num'; v: string }
  | { k: 'var'; show: string; say: string }
  | { k: 'sym'; show: string; say: string; rel?: boolean; op?: boolean }
  | { k: 'fn'; name: string }
  | { k: 'text'; v: string }
  | { k: 'chem'; v: string }
  | { k: 'group'; body: Node[] }
  | { k: 'paren'; open: string; close: string; body: Node[] }
  | { k: 'frac'; num: Node[]; den: Node[] }
  | { k: 'sqrt'; body: Node[]; index: Node[] | null }
  | { k: 'script'; base: Node; sup: Node[] | null; sub: Node[] | null }
  | { k: 'break' };

// ── Vocabulary ───────────────────────────────────────────────────────────────

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ',
  omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ',
  Psi: 'Ψ', Omega: 'Ω',
};

// How a function is said. Indian classrooms say "cos", "tan", "cosec", "sine inverse".
const FN_SAY: Record<string, string> = {
  sin: 'sine', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'cosec', cosec: 'cosec',
  arcsin: 'sine inverse', arccos: 'cos inverse', arctan: 'tan inverse', sinh: 'shine', cosh: 'cosh',
  tanh: 'than', log: 'log', ln: 'natural log', lg: 'log', exp: 'exponential', lim: 'the limit',
  max: 'the maximum of', min: 'the minimum of', det: 'the determinant of', gcd: 'the HCF of',
  sum: 'the sum', prod: 'the product', int: 'the integral', oint: 'the integral',
};

/** show: on screen; say: aloud. rel: a relation, which ends an open fraction or root. */
const SYM: Record<string, { show: string; say: string; rel?: boolean; op?: boolean }> = {
  '+': { show: '+', say: 'plus', op: true },
  '-': { show: '−', say: 'minus', op: true },
  '*': { show: '×', say: 'times', op: true },
  '/': { show: '/', say: 'over' },
  '=': { show: '=', say: 'equals', rel: true },
  '<': { show: '<', say: 'is less than', rel: true },
  '>': { show: '>', say: 'is greater than', rel: true },
  ',': { show: ',', say: ',' },
  ';': { show: ';', say: ',' },
  ':': { show: ':', say: 'is to' },
  '!': { show: '!', say: 'factorial' },
  '%': { show: '%', say: 'percent' },
  '[': { show: '[', say: 'open bracket' },
  ']': { show: ']', say: 'close bracket' },
  '|': { show: '|', say: 'mod' },
  "'": { show: '′', say: 'dash' },
  '.': { show: '.', say: '' },
  cdot: { show: '·', say: 'times', op: true },
  times: { show: '×', say: 'times', op: true },
  div: { show: '÷', say: 'divided by', op: true },
  pm: { show: '±', say: 'plus or minus', op: true },
  mp: { show: '∓', say: 'minus or plus', op: true },
  le: { show: '≤', say: 'is less than or equal to', rel: true },
  leq: { show: '≤', say: 'is less than or equal to', rel: true },
  ge: { show: '≥', say: 'is greater than or equal to', rel: true },
  geq: { show: '≥', say: 'is greater than or equal to', rel: true },
  ne: { show: '≠', say: 'is not equal to', rel: true },
  neq: { show: '≠', say: 'is not equal to', rel: true },
  approx: { show: '≈', say: 'is approximately', rel: true },
  equiv: { show: '≡', say: 'is identical to', rel: true },
  Rightarrow: { show: '⇒', say: 'so', rel: true },
  implies: { show: '⇒', say: 'so', rel: true },
  rightarrow: { show: '→', say: 'gives', rel: true },
  to: { show: '→', say: 'tends to', rel: true },
  Leftrightarrow: { show: '⇔', say: 'if and only if', rel: true },
  iff: { show: '⇔', say: 'if and only if', rel: true },
  therefore: { show: '∴', say: 'therefore', rel: true },
  because: { show: '∵', say: 'because', rel: true },
  in: { show: '∈', say: 'in', rel: true },
  perp: { show: '⊥', say: 'is perpendicular to', rel: true },
  parallel: { show: '∥', say: 'is parallel to', rel: true },
  propto: { show: '∝', say: 'is proportional to', rel: true },
  infty: { show: '∞', say: 'infinity' },
  circ: { show: '°', say: 'degrees' },
  degree: { show: '°', say: 'degrees' },
  angle: { show: '∠', say: 'angle' },
  triangle: { show: '△', say: 'triangle' },
  partial: { show: '∂', say: 'partial' },
  ldots: { show: '…', say: 'and so on' },
  cdots: { show: '⋯', say: 'and so on' },
  dots: { show: '…', say: 'and so on' },
  '{': { show: '{', say: '' },
  '}': { show: '}', say: '' },
};

// Spacing and sizing commands: nothing to show or say.
const SILENT = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad', 'displaystyle', 'textstyle',
  'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr', 'limits', 'nolimits']);
const TEXT_CMD = new Set(['text', 'textrm', 'textbf', 'textit', 'mathrm', 'mathbf', 'mathit', 'mbox', 'operatorname']);
const FRAC_CMD = new Set(['frac', 'dfrac', 'tfrac', 'cfrac']);
// Functions recognised without their backslash; longest first, so "cosec" beats "cos".
const BARE_FN = ['cosec', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln'];

// ── Parse ────────────────────────────────────────────────────────────────────

class Parser {
  i = 0;
  constructor(private s: string) {}

  private ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }

  private command(): string {
    const m = /^\\([a-zA-Z]+|.)/.exec(this.s.slice(this.i));
    if (!m) {
      this.i++;
      return '';
    }
    this.i += m[0].length;
    return m[1];
  }

  /** The raw text of a {…} argument, braces balanced. */
  private raw(): string {
    this.ws();
    if (this.s[this.i] !== '{') return '';
    let depth = 0;
    const start = this.i + 1;
    for (; this.i < this.s.length; this.i++) {
      if (this.s[this.i] === '{') depth++;
      else if (this.s[this.i] === '}' && --depth === 0) break;
    }
    return this.s.slice(start, this.i++);
  }

  /** The delimiter after \left or \right: a character or a command like \{ or \vert. */
  private delim(): string {
    this.ws();
    if (this.s[this.i] === '\\') {
      const c = this.command();
      return c === 'vert' || c === 'lvert' || c === 'rvert' ? '|' : c === 'langle' ? '⟨' : c === 'rangle' ? '⟩' : c;
    }
    const c = this.s[this.i++] ?? '';
    return c === '.' ? '' : c;
  }

  /** A sequence up to `stop` ('}', ')', ']', 'right' or the end); the stop is consumed. */
  seq(stop = ''): Node[] {
    const out: Node[] = [];
    for (;;) {
      this.ws();
      if (this.i >= this.s.length) return out;
      const c = this.s[this.i];
      if (stop === 'right' && this.s.startsWith('\\right', this.i)) {
        this.i += 6;
        return out;
      }
      if (stop && c === stop) {
        this.i++;
        return out;
      }
      if (c === '}' && stop !== '}') {
        this.i++; // a stray brace
        continue;
      }
      const atom = this.atom(stop);
      if (atom) out.push(this.scripts(atom));
    }
  }

  /** ^ and _ after a node, in either order, plus primes. */
  private scripts(base: Node): Node {
    let sup: Node[] | null = null;
    let sub: Node[] | null = null;
    for (;;) {
      this.ws();
      const c = this.s[this.i];
      if (c === '^' && !sup) {
        this.i++;
        sup = this.arg();
      } else if (c === '_' && !sub) {
        this.i++;
        sub = this.arg();
      } else break;
    }
    return sup || sub ? { k: 'script', base, sup, sub } : base;
  }

  /** One argument: a {group}, or a single character or command (x^23 is x² then 3). */
  private arg(): Node[] {
    this.ws();
    const c = this.s[this.i];
    if (c === '{') {
      this.i++;
      return this.seq('}');
    }
    if (c && /[0-9a-zA-Z]/.test(c)) {
      this.i++;
      return [/\d/.test(c) ? { k: 'num', v: c } : letter(c)];
    }
    const atom = this.atom();
    return atom ? [atom] : [];
  }

  private atom(stop = ''): Node | null {
    const s = this.s;
    const c = s[this.i];
    if (c === '{') {
      this.i++;
      return { k: 'group', body: this.seq('}') };
    }
    if (c === '(') {
      this.i++;
      return { k: 'paren', open: '(', close: ')', body: this.seq(')') };
    }
    if (c === '|' && stop !== '|') {
      this.i++;
      return { k: 'paren', open: '|', close: '|', body: this.seq('|') };
    }
    if (c === '&' || c === '~') {
      this.i++; // alignment and non-breaking space
      return null;
    }
    if (c === '^' || c === '_') return { k: 'group', body: [] }; // a script with no base
    if (c === '\\') {
      if (s[this.i + 1] === '\\') {
        this.i += 2;
        return { k: 'break' };
      }
      return this.cmd(this.command());
    }
    const num = /^(\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(this.i));
    if (num) {
      this.i += num[0].length;
      return { k: 'num', v: num[0] };
    }
    const word = /^[a-zA-Z]+/.exec(s.slice(this.i));
    if (word) {
      const w = word[0];
      // A bare function name ("sin^2 x", written without the backslash) is a function.
      // "Sin" too: the textbook in the owner's screenshot capitalises it.
      const fn = BARE_FN.find((f) => w.toLowerCase().startsWith(f));
      if (fn && w.length - fn.length <= 1) {
        this.i += fn.length;
        return { k: 'fn', name: fn };
      }
      // Three letters or more is a word the model left in the maths ("where", "so"),
      // not x·y·z: model-written maths almost never multiplies three bare letters.
      if (w.length >= 3) {
        this.i += w.length;
        return { k: 'text', v: w };
      }
      this.i++;
      return letter(w[0]);
    }
    this.i++;
    const sym = SYM[c];
    return sym ? { k: 'sym', ...sym } : { k: 'text', v: c };
  }

  private cmd(name: string): Node | null {
    if (SILENT.has(name)) return null;
    if (FRAC_CMD.has(name)) {
      const num = this.arg();
      return { k: 'frac', num, den: this.arg() };
    }
    if (name === 'sqrt') {
      this.ws();
      let index: Node[] | null = null;
      if (this.s[this.i] === '[') {
        this.i++;
        index = this.seq(']');
      }
      return { k: 'sqrt', body: this.arg(), index };
    }
    if (name === 'left') {
      const open = this.delim();
      const body = this.seq('right');
      return { k: 'paren', open, close: this.delim(), body };
    }
    if (name === 'begin' || name === 'end') {
      const env = this.raw();
      if (name === 'begin' && /array|tabular/.test(env)) this.raw(); // its column spec
      return null;
    }
    if (name === 'ce' || name === 'pu') return { k: 'chem', v: this.raw() };
    if (TEXT_CMD.has(name)) {
      const text = this.raw();
      if (name === 'operatorname') return { k: 'fn', name: text };
      return { k: 'text', v: text };
    }
    if (name in FN_SAY) return { k: 'fn', name };
    if (name in GREEK) return { k: 'var', show: GREEK[name], say: name.toLowerCase() };
    const sym = SYM[name];
    if (sym) return { k: 'sym', ...sym };
    return { k: 'text', v: name }; // an unknown command: its name is the best guess
  }
}

/** Letters are said as capitals: Piper reads "A" as the letter and "a" as the article,
 * and voice/shorthand.ts spells lowercase h, k, q and u out as chat words. */
const letter = (c: string): Node => ({ k: 'var', show: c, say: c.toUpperCase() });

export function parseMath(latex: string): Node[] {
  return new Parser(latex).seq();
}

// ── Unicode ──────────────────────────────────────────────────────────────────

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', y: 'ʸ',
};
const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '−': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', i: 'ᵢ', n: 'ₙ',
};
const VULGAR: Record<string, string> = {
  '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/5': '⅕', '1/6': '⅙', '1/8': '⅛',
};

const mapAll = (text: string, table: Record<string, string>) =>
  [...text].every((ch) => ch in table) ? [...text].map((ch) => table[ch]).join('') : null;

/** A side that needs no brackets: one number, letter or already-bracketed group. */
function simple(nodes: Node[]): boolean {
  if (nodes.length !== 1) return false;
  const n = nodes[0];
  if (n.k === 'group') return simple(n.body);
  // A root of one thing reads as one thing: "1 over root 2".
  if (n.k === 'sqrt') return !n.index && simple(n.body);
  return n.k === 'num' || n.k === 'var' || n.k === 'paren' || (n.k === 'text' && !/\s/.test(n.v));
}

/** Only numbers and letters, "2a" or "dx": a product that reads fine without brackets. */
const atomic = (nodes: Node[]) => nodes.length > 0 && nodes.every((n) => n.k === 'num' || n.k === 'var');

function show(nodes: Node[]): string {
  let out = '';
  nodes.forEach((n, i) => {
    const prev = nodes[i - 1];
    if (n.k === 'sym' && (n.rel || n.op)) {
      // A minus with nothing to its left is a sign: "−5", not " − 5".
      const unary = n.op && (!prev || (prev.k === 'sym' && (prev.rel || prev.op)));
      out += unary ? n.show : ` ${n.show} `;
      return;
    }
    if (n.k === 'text' && /[a-zA-Z]{2,}/.test(n.v)) {
      out += ` ${n.v.trim()} `;
      return;
    }
    out += showNode(n);
    // "sin θ", "log x": a function name and its argument need a gap.
    const isFn = n.k === 'fn' || (n.k === 'script' && n.base.k === 'fn');
    if (isFn && nodes[i + 1] && nodes[i + 1].k !== 'paren') out += ' ';
  });
  return out.replace(/\s{2,}/g, ' ').trim();
}

function showNode(n: Node): string {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'var':
    case 'sym':
      return n.show;
    case 'fn':
      return n.name === 'csc' ? 'cosec' : n.name;
    case 'text':
      return n.v;
    case 'chem':
      return chemToText(n.v);
    case 'group':
      return show(n.body);
    case 'paren':
      return `${n.open}${show(n.body)}${n.close}`;
    case 'break':
      return '; ';
    case 'frac': {
      const a = show(n.num);
      const b = show(n.den);
      if (VULGAR[`${a}/${b}`]) return VULGAR[`${a}/${b}`];
      const side = (nodes: Node[], text: string) => (simple(nodes) || atomic(nodes) ? text : `(${text})`);
      return `${side(n.num, a)}/${side(n.den, b)}`;
    }
    case 'sqrt': {
      const body = simple(n.body) ? show(n.body) : `(${show(n.body)})`;
      const index = n.index ? show(n.index) : '';
      const root = index === '3' ? '∛' : index === '4' ? '∜' : index ? `${mapAll(index, SUP) ?? index}√` : '√';
      return root + body;
    }
    case 'script': {
      let out = showNode(n.base);
      if (n.sub) {
        const sub = show(n.sub);
        out += mapAll(sub, SUB) ?? `_${simple(n.sub) ? sub : `(${sub})`}`;
      }
      if (n.sup) {
        const sup = show(n.sup);
        out += sup === '°' ? '°' : (mapAll(sup, SUP) ?? `^${simple(n.sup) ? sup : `(${sup})`}`);
      }
      return out;
    }
  }
}

/** A formula as one line of Unicode text: "\sin^2\theta + \frac{1}{2}" → "sin²θ + ½". */
export function mathToText(latex: string): string {
  return show(parseMath(latex));
}

// ── Speech ───────────────────────────────────────────────────────────────────

const isDegree = (nodes: Node[]) => nodes.length === 1 && nodes[0].k === 'sym' && nodes[0].show === '°';
const firstVar = (nodes: Node[], v: string) => nodes[0]?.k === 'var' && nodes[0].show === v;

/**
 * A sequence said aloud. `closes`: what follows ends it anyway (the end of the line,
 * or a relation), so a fraction or root there needs no "end fraction".
 */
function say(nodes: Node[], closes = true): string {
  const parts = nodes.map((n, i) => {
    const next = nodes[i + 1];
    const ends = next ? next.k === 'sym' && !!next.rel : closes;
    const said = sayNode(n, ends);
    // "sine inverse of 1 over root 2": without the "of", the ear hears
    // (sine inverse 1) over root 2.
    const fn = n.k === 'fn' ? n.name : n.k === 'script' && n.base.k === 'fn' ? n.base.name : '';
    const takes = next && (next.k === 'paren' || next.k === 'frac');
    if (fn && FN_SAY[fn] && !/of$/.test(said) && takes) return `${said} of`;
    // (1/2)(1/3) and 2(x + 1) multiply; side by side aloud they run together.
    const prev = nodes[i - 1];
    if (n.k === 'paren' && n.open !== '|' && prev && (prev.k === 'paren' || prev.k === 'num')) return `times ${said}`;
    return said;
  });
  return parts.filter(Boolean).join(' ');
}

function sayNode(n: Node, closes: boolean): string {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'var':
    case 'sym':
      return n.say;
    case 'fn':
      return FN_SAY[n.name] ?? n.name;
    case 'text':
      return speakUnits(n.v, true);
    case 'chem':
      return chemToSpeech(n.v);
    case 'group':
      return say(n.body, closes);
    case 'break':
      return '.';
    case 'paren': {
      if (n.open === '|') return `mod ${say(n.body)},`;
      // Brackets matter aloud only around a sum: (1 + cos θ). Around one thing, or a
      // plain 1/2, they add nothing.
      const sum = n.body.some((b) => b.k === 'sym' && (b.op || b.rel) && b.show !== '/');
      if (!sum) return say(n.body, closes);
      return `bracket ${say(n.body)}, close bracket`;
    }
    case 'frac': {
      // dy/dx is "d y by d x" in any Indian classroom.
      if (firstVar(n.num, 'd') && firstVar(n.den, 'd')) return `${say(n.num)} by ${say(n.den)}`;
      if (simple(n.num) && simple(n.den)) return `${say(n.num)} over ${say(n.den)}`;
      return `the fraction ${say(n.num, false)}, over ${say(n.den, closes)}${closes ? ',' : ', end fraction,'}`;
    }
    case 'sqrt': {
      const index = n.index ? say(n.index) : '';
      const which = !index ? 'square root' : index === '3' ? 'cube root' : `root ${index}`;
      if (simple(n.body) && !index) return `root ${say(n.body)}`;
      return `the ${which} of ${say(n.body, closes)}${closes || simple(n.body) ? '' : ', end root,'}`;
    }
    case 'script':
      return sayScript(n, closes);
  }
}

function sayScript(n: Extract<Node, { k: 'script' }>, closes: boolean): string {
  const base = n.base;
  const fn = base.k === 'fn' ? base.name : '';
  // Limits and big operators read their scripts as a range: "the sum from i equals 1 to n of".
  if (fn === 'lim') return `the limit as ${say(n.sub ?? [])}, of`;
  if (fn === 'sum' || fn === 'prod' || fn === 'int' || fn === 'oint') {
    const from = n.sub ? ` from ${say(n.sub)}` : '';
    const to = n.sup ? ` to ${say(n.sup)}` : '';
    return `${FN_SAY[fn]}${from}${to}, of`;
  }
  let out = sayNode(base, false);
  if (n.sub) {
    if (fn === 'log') out = `log base ${say(n.sub)} of`;
    else out += simple(n.sub) ? ` ${say(n.sub)}` : ` sub ${say(n.sub)},`;
  }
  if (n.sup) {
    const sup = show(n.sup);
    if (isDegree(n.sup)) out += ' degrees';
    else if (sup === '2') out += ' squared';
    else if (sup === '3') out += ' cubed';
    else if (fn && sup === '−1') out += ' inverse';
    else if (simple(n.sup)) out += ` to the power ${say(n.sup)}`;
    else out += ` to the power ${say(n.sup, closes)}${closes ? ',' : ', end power,'}`;
  }
  return out;
}

const tidy = (text: string) =>
  text
    .replace(/\s+([,.])/g, '$1')
    .replace(/,(\s*,)+/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.]+|[\s,]+$/g, '')
    .trim();

/** Each line of a formula as words, one per step: an aligned block's rows come apart. */
export function mathToSpeechLines(latex: string): string[] {
  const lines: Node[][] = [[]];
  for (const n of parseMath(latex)) {
    if (n.k === 'break') lines.push([]);
    else lines[lines.length - 1].push(n);
  }
  return lines.map((l) => tidy(say(l))).filter(Boolean);
}

/** A formula said aloud: "\frac{\sin\theta}{1+\cos\theta}" → "the fraction sine theta, over 1 plus cos theta". */
export function mathToSpeech(latex: string): string {
  return mathToSpeechLines(latex).join(', ');
}

// ── Chemistry (\ce{…}, KaTeX's mhchem) ──────────────────────────────────────

const STATE: Record<string, string> = { s: 'solid', l: 'liquid', g: 'gas', aq: 'aqueous' };
const ARROW: [RegExp, string, string][] = [
  [/<=>|<->|⇌/g, ' ⇌ ', ' is in equilibrium with '],
  [/->|→/g, ' → ', ' gives '],
  [/<-/g, ' ← ', ' comes from '],
];
const charge = (c: string) => c.replace(/^(\d*)([+-])$/, (_, n, sign) => `${n || ''} ${sign === '+' ? 'plus' : 'minus'}`).trim();

/** "2H2 + O2 -> 2H2O" → "2H₂ + O₂ → 2H₂O". Pure. */
export function chemToText(ce: string): string {
  let t = ce;
  for (const [re, shown] of ARROW) t = t.replace(re, shown);
  t = t
    .replace(/\^\{?([0-9]*[+-])\}?/g, (_, c) => mapAll(c.replace('-', '−'), SUP) ?? `^${c}`)
    // mhchem's bare charge: "OH-", "NH4+" — a sign at the end of a formula.
    .replace(/([A-Za-z)\d])([+-])(?=\s|$)/g, (_, a, sign) => a + (sign === '+' ? '⁺' : '⁻'))
    .replace(/([A-Za-z)\]])(\d+)/g, (_, a, d) => a + (mapAll(d, SUB) ?? d))
    .replace(/_\{?(\d+)\}?/g, (_, d) => mapAll(d, SUB) ?? d);
  return t.replace(/\s{2,}/g, ' ').trim();
}

/** "2H2 + O2 -> 2H2O" → "2 H 2 plus O 2 gives 2 H 2 O": the letters of a formula said one
 * by one, as a classroom reads NaCl — "N A C L". Pure. */
export function chemToSpeech(ce: string): string {
  let t = ce;
  for (const [re, , said] of ARROW) t = t.replace(re, said);
  const words = t
    .replace(/\(\s*(s|l|g|aq)\s*\)/g, (_, st) => ` ${STATE[st]} `)
    .replace(/\^\{?([0-9]*[+-])\}?/g, (_, c) => ` ${charge(c)} `)
    .replace(/([A-Za-z)\d])([+-])(?=\s|$)/g, (_, a, sign) => `${a} ${sign === '+' ? 'plus' : 'minus'} `)
    .replace(/\s\+\s/g, ' plus ')
    .replace(/_\{?(\d+)\}?/g, ' $1 ')
    .replace(/([A-Z][a-z]?)/g, (el) => ` ${el.toUpperCase().split('').join(' ')} `)
    .replace(/(\d+)/g, ' $1 ')
    .replace(/[{}()]/g, ' ');
  return words.replace(/\s{2,}/g, ' ').trim();
}

// ── Units ────────────────────────────────────────────────────────────────────

// Longest first, so "m/s^2" wins over "m/s" and "m". A unit only counts after a number
// (or alone in \text{}), so "m" in a word or "A" as an option letter stays as it is.
const UNITS: [string, string][] = [
  ['m/s^2', 'metres per second squared'], ['m/s²', 'metres per second squared'],
  ['km/h', 'kilometres per hour'], ['km/hr', 'kilometres per hour'], ['kmph', 'kilometres per hour'],
  ['m/s', 'metres per second'], ['cm^2', 'square centimetres'], ['cm²', 'square centimetres'],
  ['m^2', 'square metres'], ['m²', 'square metres'], ['cm^3', 'cubic centimetres'], ['cm³', 'cubic centimetres'],
  ['m^3', 'cubic metres'], ['m³', 'cubic metres'], ['°C', 'degrees Celsius'], ['kg', 'kilograms'],
  ['km', 'kilometres'], ['cm', 'centimetres'], ['mm', 'millimetres'], ['mg', 'milligrams'], ['mL', 'millilitres'],
  ['ml', 'millilitres'], ['kJ', 'kilojoules'], ['kW', 'kilowatts'], ['kWh', 'kilowatt hours'], ['Hz', 'hertz'],
  ['Pa', 'pascals'], ['mol', 'moles'], ['min', 'minutes'], ['hr', 'hours'], ['Ω', 'ohms'],
  ['m', 'metres'], ['g', 'grams'], ['s', 'seconds'], ['N', 'newtons'], ['J', 'joules'], ['W', 'watts'],
  ['V', 'volts'], ['A', 'amperes'], ['K', 'kelvin'], ['L', 'litres'],
];
UNITS.sort((a, b) => b[0].length - a[0].length);
const esc = (u: string) => u.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const AFTER_NUMBER = new RegExp(`(\\d)\\s*(${UNITS.map(([u]) => esc(u)).join('|')})(?![A-Za-z0-9])`, 'g');
const UNIT_SAY = new Map(UNITS);

/** Units said as words: "9.8 m/s²" → "9.8 metres per second squared". `alone`: the
 * whole text is a unit (a formula's \text{km/h}), with no number before it. Pure. */
export function speakUnits(text: string, alone = false): string {
  if (alone && UNIT_SAY.has(text.trim())) return UNIT_SAY.get(text.trim())!;
  return text.replace(AFTER_NUMBER, (_, d, u) => `${d} ${UNIT_SAY.get(u)}`);
}

/** Bare LaTeX the model left outside dollars: worth reading as maths, not as backslashes. */
export const BARE_LATEX =
  /\\(frac|dfrac|sqrt|sin|cos|tan|cot|sec|csc|cosec|theta|alpha|beta|pi|times|cdot|div|pm|le|ge|leq|geq|neq|infty|circ|left|right)\b/;

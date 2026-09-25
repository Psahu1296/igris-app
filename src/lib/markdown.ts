import { withoutEmoji } from '@/lib/device';

/**
 * A small Markdown reader for Igris's answers — enough of GitHub's flavour to lay a
 * lesson out: headings, paragraphs, lists and task lists, quotes, code, tables,
 * rules, and flow diagrams.
 *
 * Hand-written, not a library: the one maintained RN renderer (markdown-it based)
 * brings its own styling system to fight with, and what Igris writes is a narrow,
 * known subset. It also has to be read TWICE — drawn on screen (components/
 * markdown.tsx) and spoken (toSpeech below) — so both work from the same blocks.
 *
 * Diagrams are ```flow blocks — "Rules → Semantic → LLM", one chain per line — drawn
 * natively as boxes and arrows, and ```mermaid blocks: a straight-line flowchart is
 * drawn the same way, anything else by mermaid itself in a WebView.
 *
 * Plain text is valid Markdown: an answer with no markup is one paragraph per line
 * group, exactly as it looked before.
 */

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'flow'; chains: string[][] }
  | { type: 'mermaid'; text: string }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'rule' };

export type ListItem = { text: string; checked: boolean | null; depth: number };

const FENCE = /^\s*(```|~~~)\s*([\w-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

export function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++; // the closing fence (or the end)
      blocks.push(codeBlock(fence[2].toLowerCase(), body.join('\n')));
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const header = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ type: 'quote', text: body.join('\n') });
      continue;
    }
    const first = ITEM.exec(line);
    if (first) {
      const ordered = /\d/.test(first[2]);
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = ITEM.exec(lines[i]);
        if (m) {
          items.push({
            text: m[4],
            checked: m[3] === undefined ? null : m[3].toLowerCase() === 'x',
            depth: Math.min(2, Math.floor(m[1].replace(/\t/g, '  ').length / 2)),
          });
          i++;
        } else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          items[items.length - 1].text += ' ' + lines[i++].trim(); // a wrapped item
        } else break;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !ITEM.test(lines[i]) &&
      !/^\s*>/.test(lines[i])
    ) {
      body.push(lines[i++].trim());
    }
    blocks.push({ type: 'paragraph', text: body.join('\n') });
  }
  return blocks;
}

function codeBlock(lang: string, text: string): Block {
  if (lang === 'flow' || lang === 'diagram') {
    const chains = text
      .split('\n')
      .map((l) => l.split(/\s*(?:->|→|=>|-->)\s*/).filter(Boolean))
      .filter((c) => c.length > 0);
    return chains.length ? { type: 'flow', chains } : { type: 'code', lang, text };
  }
  if (lang === 'mermaid') {
    // A straight path draws natively and instantly; anything else — branches,
    // sequence diagrams — goes to the real mermaid renderer (components/mermaid.tsx).
    const chains = mermaidChains(text);
    return chains && chains.length === 1 ? { type: 'flow', chains } : { type: 'mermaid', text };
  }
  return { type: 'code', lang, text };
}

const NODE = String.raw`([\w-]+)(?:\[\(?"?([^\]"]+?)"?\)?\]|\(\(?"?([^)"]+?)"?\)?\)|\{"?([^}"]+?)"?\})?`;
const EDGE = new RegExp(`${NODE}\\s*-+(?:\\.|=)*->?\\s*(?:\\|[^|]*\\|\\s*)?${NODE}`);

/** A mermaid flowchart's edges as chains: a straight path joins into one chain. */
function mermaidChains(text: string): string[][] | null {
  if (!/^\s*(graph|flowchart)\b/m.test(text)) return null;
  const label = new Map<string, string>();
  const edges: [string, string][] = [];
  for (const line of text.split('\n')) {
    const m = EDGE.exec(line);
    if (!m) continue;
    const [, a, a1, a2, a3, b, b1, b2, b3] = m;
    if (a1 || a2 || a3) label.set(a, a1 || a2 || a3);
    if (b1 || b2 || b3) label.set(b, b1 || b2 || b3);
    edges.push([a, b]);
  }
  if (!edges.length) return null;
  const name = (id: string) => label.get(id) ?? id;
  const outs = new Map<string, string[]>();
  const ins = new Map<string, number>();
  for (const [a, b] of edges) {
    outs.set(a, [...(outs.get(a) ?? []), b]);
    ins.set(b, (ins.get(b) ?? 0) + 1);
  }
  const linear = [...outs.values()].every((o) => o.length === 1) && [...ins.values()].every((n) => n === 1);
  const start = edges.find(([a]) => !ins.has(a))?.[0];
  if (linear && start) {
    const chain = [name(start)];
    for (let at = start; outs.get(at); at = outs.get(at)![0]) {
      if (chain.length > edges.length) break; // a cycle
      chain.push(name(outs.get(at)![0]));
    }
    return [chain];
  }
  return edges.map(([a, b]) => [name(a), name(b)]);
}

// ── Inline ───────────────────────────────────────────────────────────────────

export type Span = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  href?: string;
};

// Underscore italics need a non-word character (or the start) before the opening _, so
// snake_case_names stay whole; that character is captured in group 1 and put back.
const INLINE =
  /(\*\*[^*]+?\*\*|__[^_]+?__|`[^`]+?`|~~[^~]+?~~|\[[^\]]+?\]\([^)\s]+?\)|\*(?!\s)[^*]+?\*|(^|[^\w])_(?!\s)[^_]+?_(?![\w]))/;

export function spans(text: string, inherit: Omit<Span, 'text'> = {}): Span[] {
  const out: Span[] = [];
  let rest = text;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push({ ...inherit, text: rest });
      break;
    }
    // For an _italic_, group 2 is the character before it — ordinary text.
    const lead = m[2] ?? '';
    const start = m.index + lead.length;
    if (start > 0) out.push({ ...inherit, text: rest.slice(0, start) });
    const tok = m[0].slice(lead.length);
    if (tok.startsWith('`')) out.push({ ...inherit, code: true, text: tok.slice(1, -1) });
    else if (tok.startsWith('**') || tok.startsWith('__')) out.push(...spans(tok.slice(2, -2), { ...inherit, bold: true }));
    else if (tok.startsWith('~~')) out.push(...spans(tok.slice(2, -2), { ...inherit, strike: true }));
    else if (tok.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      out.push({ ...inherit, text: link[1], href: link[2] });
    } else out.push(...spans(tok.slice(1, -1), { ...inherit, italic: true }));
    rest = rest.slice(start + tok.length);
  }
  return out;
}

const plain = (text: string) =>
  spans(text)
    .map((s) => s.text)
    .join('');

// ── Speech ───────────────────────────────────────────────────────────────────

const sentence = (text: string) => {
  const t = withoutEmoji(plain(text)).replace(/\s+/g, ' ').trim();
  return !t ? '' : /[.!?:]$/.test(t) ? t : `${t}.`;
};

/**
 * What the speaker says for a Markdown answer: the words, not the marks. A table is
 * read row by row ("Questions: 2. Average: 3.5."), a flow as "A, then B, then C", and
 * code is left to the screen. One paragraph per line, so the voice picker
 * (voice/language.ts) still judges each on its own.
 */
export function toSpeech(markdown: string): string {
  const out: string[] = [];
  for (const b of parse(markdown)) {
    switch (b.type) {
      case 'heading':
      case 'paragraph':
      case 'quote':
        out.push(sentence(b.text.replace(/\n/g, ' ')));
        break;
      case 'list':
        out.push(...b.items.map((item) => sentence(item.text)));
        break;
      case 'table':
        for (const row of b.rows) {
          out.push(
            sentence(row.map((cell, i) => (b.header[i] ? `${plain(b.header[i])}: ${cell}` : cell)).join(', '))
          );
        }
        break;
      case 'flow':
        out.push(...b.chains.map((c) => sentence(c.map(plain).join(', then '))));
        break;
      case 'mermaid':
        out.push('The diagram is on screen.');
        break;
      case 'code':
      case 'rule':
        break;
    }
  }
  return out.filter(Boolean).join('\n');
}

import { ArrowDown, Square, SquareCheck } from 'lucide-react-native';
import { Fragment } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { Mermaid } from '@/components/mermaid';
import { Answer } from '@/components/typography';
import { Font, Palette, Space, Type } from '@/constants/theme';
import { parse, spans, type Block, type ListItem } from '@/lib/markdown';

/**
 * Igris's answer, laid out (lib/markdown.ts parses it). Paragraphs keep the serif
 * "voice" of Answer; structure — headings, lists, tables, code, diagrams — is sans or
 * mono, so the eye can tell reading from scanning. Plain text renders exactly as the
 * old single <Answer> did.
 */
export function Markdown({ text, accent }: { text: string; accent: string }) {
  return (
    <View style={styles.root}>
      {parse(text).map((block, i) => (
        <BlockView key={i} block={block} accent={accent} />
      ))}
    </View>
  );
}

function BlockView({ block, accent }: { block: Block; accent: string }) {
  switch (block.type) {
    case 'heading':
      return (
        <Text style={[styles.heading, HEADING_SIZE[Math.min(block.level, 3) - 1]]}>
          <Inline text={block.text} accent={accent} />
        </Text>
      );
    case 'paragraph':
      return (
        <Answer>
          <Inline text={block.text} accent={accent} />
        </Answer>
      );
    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: accent }]}>
          <Text style={styles.quoteText}>
            <Inline text={block.text} accent={accent} />
          </Text>
        </View>
      );
    case 'list':
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <Item key={i} item={item} index={i} ordered={block.ordered} accent={accent} />
          ))}
        </View>
      );
    case 'code':
      return (
        <ScrollView horizontal style={styles.code} contentContainerStyle={styles.codeInner}>
          <Text style={styles.codeText}>{block.text}</Text>
        </ScrollView>
      );
    case 'table':
      return <Table header={block.header} rows={block.rows} accent={accent} />;
    case 'flow':
      return <Flow chains={block.chains} accent={accent} />;
    case 'mermaid':
      return <Mermaid source={block.text} accent={accent} />;
    case 'rule':
      return <View style={styles.rule} />;
  }
}

/** `sans`: the text around is IBM Plex (lists, tables, diagrams), so bold stays in it. */
function Inline({ text, accent, sans = false }: { text: string; accent: string; sans?: boolean }) {
  return (
    <>
      {spans(text).map((s, i) => {
        const style: TextStyle[] = [];
        if (s.bold) style.push(sans ? styles.boldSans : styles.bold);
        if (s.italic) style.push(styles.italic);
        if (s.strike) style.push(styles.strike);
        if (s.code) style.push(styles.inlineCode);
        if (s.href) style.push({ color: accent, textDecorationLine: 'underline' });
        return (
          <Text
            key={i}
            style={style}
            onPress={s.href ? () => void Linking.openURL(s.href!) : undefined}>
            {s.text}
          </Text>
        );
      })}
    </>
  );
}

function Item({
  item,
  index,
  ordered,
  accent,
}: {
  item: ListItem;
  index: number;
  ordered: boolean;
  accent: string;
}) {
  const marker =
    item.checked === true ? (
      <SquareCheck size={17} color={accent} />
    ) : item.checked === false ? (
      <Square size={17} color={Palette.muted} />
    ) : (
      <Text style={[styles.bullet, { color: accent }]}>{ordered ? `${index + 1}.` : '•'}</Text>
    );
  return (
    <View style={[styles.item, { paddingLeft: item.depth * 18 }]}>
      <View style={styles.marker}>{marker}</View>
      <Text style={[styles.itemText, item.checked === true && styles.done]}>
        <Inline text={item.text} accent={accent} sans />
      </Text>
    </View>
  );
}

function Table({ header, rows, accent }: { header: string[]; rows: string[][]; accent: string }) {
  const columns = Math.max(header.length, ...rows.map((r) => r.length));
  const cell = (text: string, i: number, head: boolean) => (
    <View key={i} style={[styles.cell, i > 0 && styles.cellDivider]}>
      <Text style={head ? [styles.cellHead, { color: accent }] : styles.cellText}>
        <Inline text={text} accent={accent} sans />
      </Text>
    </View>
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.table}>
      <View>
        <View style={[styles.row, styles.headRow]}>
          {Array.from({ length: columns }, (_, i) => cell(header[i] ?? '', i, true))}
        </View>
        {rows.map((row, r) => (
          <View key={r} style={[styles.row, r % 2 === 1 && styles.rowAlt]}>
            {Array.from({ length: columns }, (_, i) => cell(row[i] ?? '', i, false))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** A ```flow diagram: each line is a chain of steps, drawn top to bottom. */
function Flow({ chains, accent }: { chains: string[][]; accent: string }) {
  return (
    <View style={styles.flow}>
      {chains.map((chain, c) => (
        <View key={c} style={styles.chain}>
          {chain.map((step, s) => (
            <Fragment key={s}>
              {s > 0 ? <ArrowDown size={16} color={Palette.muted} /> : null}
              <View style={[styles.node, { borderColor: accent + '66', backgroundColor: accent + '14' }]}>
                <Text style={styles.nodeText}>
                  <Inline text={step} accent={accent} sans />
                </Text>
              </View>
            </Fragment>
          ))}
        </View>
      ))}
    </View>
  );
}

const HEADING_SIZE: TextStyle[] = [
  { fontSize: 22, lineHeight: 28 },
  { fontSize: 19, lineHeight: 25 },
  { fontSize: 16, lineHeight: 22, letterSpacing: 0.3 },
];

const styles = StyleSheet.create({
  root: { gap: Space.md },
  heading: { fontFamily: Font.voiceMedium, color: Palette.text, marginTop: Space.xs },
  bold: { fontFamily: Font.voiceMedium, color: Palette.text },
  boldSans: { fontFamily: Font.uiMedium, color: Palette.text },
  italic: { fontFamily: Font.voiceItalic },
  strike: { textDecorationLine: 'line-through', color: Palette.muted },
  inlineCode: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: Palette.text,
    backgroundColor: Palette.surfaceGlassHover,
  },
  quote: { borderLeftWidth: 3, paddingLeft: Space.md, paddingVertical: 2 },
  quoteText: { fontFamily: Font.voiceItalic, color: Palette.muted, ...Type.answer },
  list: { gap: Space.sm },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.sm },
  marker: { minWidth: 18, alignItems: 'center', paddingTop: 3 },
  bullet: { fontFamily: Font.uiMedium, fontSize: 15, lineHeight: 22 },
  itemText: { flex: 1, fontFamily: Font.ui, color: Palette.text, ...Type.ask },
  done: { color: Palette.muted },
  code: {
    borderRadius: 10,
    backgroundColor: Palette.surfaceGlass,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  codeInner: { padding: Space.md },
  codeText: { fontFamily: 'monospace', fontSize: 13, lineHeight: 19, color: Palette.text },
  rule: { height: 1, backgroundColor: Palette.hairline, marginVertical: Space.xs },
  table: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Palette.hairline,
  },
  row: { flexDirection: 'row' },
  headRow: { backgroundColor: Palette.surfaceGlassHover },
  rowAlt: { backgroundColor: Palette.surfaceGlass },
  cell: { minWidth: 96, maxWidth: 220, paddingHorizontal: Space.md, paddingVertical: Space.sm },
  cellDivider: { borderLeftWidth: 1, borderLeftColor: Palette.hairline },
  cellHead: { fontFamily: Font.uiMedium, fontSize: 13, lineHeight: 18 },
  cellText: { fontFamily: Font.ui, color: Palette.text, fontSize: 13, lineHeight: 19 },
  flow: { gap: Space.md },
  chain: { alignItems: 'center', gap: 6 },
  node: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  nodeText: { fontFamily: Font.uiMedium, color: Palette.text, fontSize: 14, textAlign: 'center' },
});

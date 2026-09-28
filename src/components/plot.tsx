import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { Font, Palette, Space } from '@/constants/theme';
import { evaluator, mathToText } from '@/lib/math';

/**
 * A ```plot block (maestro plot.py): curves of x drawn natively with react-native-svg.
 * Native rather than a plotting library in a WebView: it draws offline, instantly, and
 * the curve is evaluated by the same reader that speaks the formula (lib/math.ts).
 *
 * The y range comes from the middle 90% of the values, so tan x or 1/x near an
 * asymptote does not flatten the rest of the curve to a line; a jump across more than
 * the whole range lifts the pen instead of drawing a vertical wall.
 */
const HEIGHT = 220;
const SAMPLES = 240;
const PAD = 28;

export function Plot({ range, curves, accent }: { range: [number, number]; curves: string[]; accent: string }) {
  const [width, setWidth] = useState(0);
  const colours = [accent, Palette.cloud, Palette.working];

  const plotted = useMemo(() => {
    const [a, b] = range;
    const fns = curves.map((c) => ({ latex: c, f: evaluator(c) }));
    const series = fns.map(({ f }) =>
      Array.from({ length: SAMPLES + 1 }, (_, i) => {
        const x = a + ((b - a) * i) / SAMPLES;
        const y = f ? f(x) : NaN;
        return { x, y: Number.isFinite(y) ? y : NaN };
      })
    );
    const ys = series
      .flat()
      .map((p) => p.y)
      .filter(Number.isFinite)
      .sort((p, q) => p - q);
    let lo = ys[Math.floor(ys.length * 0.05)] ?? -1;
    let hi = ys[Math.ceil(ys.length * 0.95) - 1] ?? 1;
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    const margin = (hi - lo) * 0.1;
    return { fns, series, lo: lo - margin, hi: hi + margin };
  }, [range, curves]);

  const [a, b] = range;
  const { lo, hi } = plotted;
  const w = Math.max(width - PAD, 1);
  const sx = (x: number) => PAD + ((x - a) / (b - a)) * w;
  const sy = (y: number) => HEIGHT - PAD / 2 - ((y - lo) / (hi - lo)) * (HEIGHT - PAD);

  const paths = plotted.series.map((points) => {
    let d = '';
    let pen = false;
    let last = NaN;
    for (const p of points) {
      const off = !Number.isFinite(p.y) || p.y < lo - (hi - lo) || p.y > hi + (hi - lo);
      if (off || (pen && Math.abs(p.y - last) > hi - lo)) {
        pen = false;
        if (off) continue;
      }
      d += `${pen ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(Math.min(Math.max(p.y, lo), hi)).toFixed(1)} `;
      pen = true;
      last = p.y;
    }
    return d;
  });

  return (
    <View style={styles.frame} onLayout={(e) => setWidth(e.nativeEvent.layout.width - Space.sm * 2)}>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          {lo < 0 && hi > 0 ? (
            <Line x1={PAD} x2={PAD + w} y1={sy(0)} y2={sy(0)} stroke={Palette.faint} strokeWidth={1} />
          ) : null}
          {a < 0 && b > 0 ? (
            <Line x1={sx(0)} x2={sx(0)} y1={PAD / 2} y2={HEIGHT - PAD / 2} stroke={Palette.faint} strokeWidth={1} />
          ) : null}
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke={colours[i % colours.length]} strokeWidth={2} fill="none" />
          ))}
          <SvgText x={PAD} y={HEIGHT - 2} fill={Palette.muted} fontSize={10}>
            {label(a)}
          </SvgText>
          <SvgText x={PAD + w} y={HEIGHT - 2} fill={Palette.muted} fontSize={10} textAnchor="end">
            {label(b)}
          </SvgText>
          <SvgText x={2} y={PAD / 2 + 8} fill={Palette.muted} fontSize={10}>
            {label(hi)}
          </SvgText>
          <SvgText x={2} y={HEIGHT - PAD / 2} fill={Palette.muted} fontSize={10}>
            {label(lo)}
          </SvgText>
        </Svg>
      ) : (
        <View style={{ height: HEIGHT }} />
      )}
      <View style={styles.legend}>
        {plotted.fns.map(({ latex, f }, i) => (
          <Text key={i} style={[styles.legendText, { color: f ? colours[i % colours.length] : Palette.muted }]}>
            {`y = ${mathToText(latex)}${f ? '' : ' (could not draw)'}`}
          </Text>
        ))}
      </View>
    </View>
  );
}

function label(v: number): string {
  for (const [k, name] of [
    [2, '2π'],
    [1, 'π'],
  ] as const) {
    if (Math.abs(Math.abs(v) - k * Math.PI) < 1e-3) return `${v < 0 ? '−' : ''}${name}`;
  }
  return Math.abs(v) >= 100 || Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1);
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.surfaceGlass,
    padding: Space.sm,
    gap: Space.xs,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md, paddingHorizontal: Space.xs },
  legendText: { fontFamily: Font.ui, fontSize: 13 },
});

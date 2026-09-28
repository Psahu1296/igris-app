import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Font, Palette, Space } from '@/constants/theme';
import { mathToText } from '@/lib/math';

/**
 * The working steps of an answer ($$…$$ lines), typeset by KaTeX in one WebView —
 * stacked fractions, roots and powers as a textbook prints them. A run of steps shares
 * one WebView (lib/markdown.ts merges them): a trig solution has eight or more, and a
 * WebView each made the transcript stutter.
 *
 * Built like components/mermaid.tsx: the LaTeX is model-written, so it goes in as JSON,
 * KaTeX runs with trust off (no \href, no \includegraphics), and the page may not
 * navigate. KaTeX loads from jsDelivr, pinned to a minor version. Offline, or if it
 * fails, each step is shown natively as Unicode text (lib/math.ts).
 */
export function MathBlock({ steps, accent }: { steps: string[]; accent: string }) {
  const [height, setHeight] = useState(56 * steps.length);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={styles.frame}>
        {steps.map((step, i) => (
          <Text key={i} style={styles.fallback}>
            {mathToText(step)}
          </Text>
        ))}
      </View>
    );
  }

  const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
<style>
html,body{margin:0;padding:0;background:transparent;color:#F5F2EC}
.step{padding:6px 2px;overflow-x:auto;overflow-y:hidden}
.step+.step{border-top:1px solid rgba(255,255,255,0.06)}
.katex{font-size:1.15em}
.katex-display{margin:0}
.katex-error{color:${accent}}
</style>
</head><body><div id="d"></div>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js"></script>
<script>
(function(){
  const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  try {
    const root = document.getElementById('d');
    for (const tex of ${JSON.stringify(steps)}) {
      const div = document.createElement('div');
      div.className = 'step';
      root.appendChild(div);
      katex.render(tex, div, { displayMode: true, throwOnError: false, trust: false, strict: 'ignore' });
      // A long line shrinks to fit before it scrolls: a phone is narrow.
      const k = div.querySelector('.katex');
      if (k && div.scrollWidth > div.clientWidth) {
        k.style.fontSize = Math.max(0.75, 1.15 * div.clientWidth / div.scrollWidth).toFixed(2) + 'em';
      }
    }
    const measure = () => post({ height: Math.ceil(root.getBoundingClientRect().height) + 4 });
    measure();
    // KaTeX's fonts arrive after the first layout and change its height.
    if (document.fonts) document.fonts.ready.then(measure);
  } catch (e) { post({ error: String(e) }); }
})();
</script></body></html>`;

  return (
    <View style={[styles.frame, { height: height + Space.sm * 2 }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        scrollEnabled={false}
        // Only the page itself; a formula has no business opening links.
        onShouldStartLoadWithRequest={(req) => req.url === 'about:blank' || req.url.startsWith('data:')}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as { height?: number; error?: string };
            if (msg.error) setFailed(true);
            else if (msg.height) setHeight(Math.min(Math.max(msg.height, 40), 2400));
          } catch {
            setFailed(true);
          }
        }}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.surfaceGlass,
    overflow: 'hidden',
    padding: Space.sm,
    gap: Space.xs,
  },
  web: { backgroundColor: 'transparent' },
  fallback: { fontFamily: Font.ui, color: Palette.text, fontSize: 17, lineHeight: 26 },
});

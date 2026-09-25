import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Meta } from '@/components/typography';
import { Palette, Space } from '@/constants/theme';

/**
 * A mermaid diagram, drawn by mermaid itself in a WebView — the only faithful way to
 * lay out branching flowcharts and sequence diagrams on a phone.
 *
 * The diagram text is written by a model, so it is treated as untrusted: mermaid runs
 * with securityLevel 'strict' (no HTML labels, no click handlers), the text is passed
 * as JSON rather than spliced into the page, and the WebView may not navigate
 * anywhere. mermaid itself loads from jsDelivr, pinned to a major version; offline, the
 * source is shown instead.
 */
export function Mermaid({ source, accent }: { source: string; accent: string }) {
  const [height, setHeight] = useState(160);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View style={styles.fallback}>
        <Meta style={styles.fallbackLabel}>Diagram could not be drawn</Meta>
        <Meta style={styles.fallbackText}>{source}</Meta>
      </View>
    );
  }

  const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;padding:0;background:transparent}#d{display:flex;justify-content:center}svg{max-width:100%;height:auto}</style>
</head><body><div id="d"></div>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
(async function(){
  const post = (m) => window.ReactNativeWebView.postMessage(JSON.stringify(m));
  try {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark',
      themeVariables: { primaryColor: ${JSON.stringify(accent + '26')}, primaryBorderColor: ${JSON.stringify(accent)},
        primaryTextColor: '#F5F2EC', lineColor: '#A29990', fontFamily: 'sans-serif', fontSize: '14px' } });
    const { svg } = await mermaid.render('g', ${JSON.stringify(source)});
    document.getElementById('d').innerHTML = svg;
    post({ height: Math.ceil(document.getElementById('d').getBoundingClientRect().height) + 8 });
  } catch (e) { post({ error: String(e) }); }
})();
</script></body></html>`;

  return (
    <View style={[styles.frame, { height }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        scrollEnabled={false}
        // Only the page itself; a diagram has no business opening links.
        onShouldStartLoadWithRequest={(req) => req.url === 'about:blank' || req.url.startsWith('data:')}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as { height?: number; error?: string };
            if (msg.error) setFailed(true);
            else if (msg.height) setHeight(Math.min(Math.max(msg.height, 60), 900));
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
  },
  web: { backgroundColor: 'transparent' },
  fallback: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.surfaceGlass,
    padding: Space.md,
    gap: Space.xs,
  },
  fallbackLabel: { color: Palette.muted },
  fallbackText: { color: Palette.faint, fontFamily: 'monospace' },
});

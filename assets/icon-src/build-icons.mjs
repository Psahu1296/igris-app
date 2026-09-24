#!/usr/bin/env node
/**
 * Builds every icon PNG, and src/lib/logo.ts, from assets/logo.svg.
 *
 *   node assets/icon-src/build-icons.mjs
 *
 * `logo.svg` is the single source of truth. It is a Recraft export, which means
 * two things this script has to deal with: 18KB of its 23KB is a C2PA provenance
 * blob inside <metadata>, and the vectoriser left six sub-pixel slivers (areas of
 * 4–66 square units against the mark's 600,000) that are invisible at every size
 * and only cost bytes. Both are stripped; the mark is the first two paths.
 *
 * WHY THE COLOURS ARE INVERTED HERE
 * The logo was drawn on white: the crown is #14121E, which against our own
 * ground (#09080E) is very nearly the same colour. Rendered as-drawn on the app's
 * plate the mark is almost invisible at 48px — checked, not assumed. So the icon
 * inverts it: the crown carries the tungsten amber that means "the Mac answered",
 * and the flame becomes the white-hot core. Set PALETTE below to `asDrawn` to get
 * the original artwork on a cream plate instead; it reads well too, it just isn't
 * dark.
 *
 * Rendering is headless Chrome, because it is already on the machine and every
 * other SVG rasteriser (librsvg, Inkscape, ImageMagick, cairosvg) would be a new
 * install. Override with CHROME=/path/to/binary.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..');
const IMAGES = resolve(ASSETS, 'images');
const TMP = resolve(HERE, '.tmp');

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error('No Chrome/Chromium found. Set CHROME=/path/to/binary.');
  process.exit(1);
}

// ── palette ──────────────────────────────────────────────────────────────────
// Must stay in step with src/constants/theme.ts and the backgroundColor keys in
// app.json, or the icon shows a seam against the splash.
const INK = '#09080E'; // Palette.ground
const AMBER = '#FFB338'; // Palette.local — "the Mac answered"
const HOT = '#FFF3D6'; // the lit core; warm white, never pure #fff
const CREAM = '#F5F2EC'; // Palette.text
const DARK = '#14121E'; // Palette.surface — the crown, as Recraft drew it

// A flat fill of AMBER reads as plastic — "gamer", not premium. The crown is metal,
// so it gets a two-stop vertical gradient: a pale highlight where light would catch
// the top of a helm, down to a deep bronze in the shade. AMBER stays at 42%, the
// optical centre of the mark, so the icon still reads as Palette.local at a glance
// and the lane colour keeps its meaning.
const GOLD_HI = '#FFE0A3';
const GOLD_LO = '#A9661A';
// The plate gets the same treatment in reverse: a warm lift behind the mark falling
// off to INK at the corners. It is a vignette, not a "gradient background" — at the
// rim it IS exactly INK, so the icon still meets the splash with no seam.
const PLATE_LIFT = '#171320';

const PALETTE = 'inverted'; // 'inverted' | 'asDrawn'
const SCHEME =
  PALETTE === 'asDrawn'
    ? { plate: CREAM, crown: DARK, flame: AMBER, metal: false }
    : { plate: INK, crown: AMBER, flame: HOT, metal: true };

/** Gradients are referenced by url(#id), so every SVG that uses one must carry them. */
const DEFS =
  `<linearGradient id="crownMetal" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0" stop-color="${GOLD_HI}"/>` +
  `<stop offset="0.42" stop-color="${AMBER}"/>` +
  `<stop offset="1" stop-color="${GOLD_LO}"/></linearGradient>` +
  `<radialGradient id="plateLift" cx="0.5" cy="0.46" r="0.72">` +
  `<stop offset="0" stop-color="${PLATE_LIFT}"/>` +
  `<stop offset="1" stop-color="${INK}"/></radialGradient>`;

const crownFill = () => (SCHEME.metal ? 'url(#crownMetal)' : SCHEME.crown);
const plateFill = () => (SCHEME.metal ? 'url(#plateLift)' : SCHEME.plate);

// ── geometry ─────────────────────────────────────────────────────────────────
// Measured from the path data below, not guessed. The mark's extremes sit on the
// axes (top spike dead centre, side spikes at mid height), so its bounding CIRCLE
// is its bounding box height — 825.74 — which is what the adaptive-icon safe zone
// actually constrains.
const CONTENT = { cx: 512.26, cy: 497.32, w: 723.76, h: 825.74 };

// Android composes the foreground on 108dp, shows at most 72dp, and OEM masks may
// crop to a 66dp circle. On a 1024 canvas that circle is 626px, so the mark is
// scaled to sit inside it: 825.74 * 0.75 = 619.3 <= 626.
const SAFE = 0.75; // adaptive foreground
const SQUARE = 0.8; // the square icon, which is only ever corner-rounded

function parseLogo() {
  const raw = readFileSync(resolve(ASSETS, 'logo.svg'), 'utf8').replace(
    /<metadata>[\s\S]*?<\/metadata>/g,
    ''
  );
  const ds = [...raw.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
  if (ds.length < 2) throw new Error(`logo.svg: expected >=2 paths, found ${ds.length}`);
  return { crown: ds[0], flame: ds[1] };
}

const { crown, flame } = parseLogo();

/** Places the mark's centre on the canvas centre at the given scale. */
const place = (scale) =>
  `translate(512 512) scale(${scale}) translate(${-CONTENT.cx} ${-CONTENT.cy})`;

const svg = (body, { plate = null, scale = SQUARE, extra = '' } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` +
  `<defs>${DEFS}</defs>` +
  (plate ? `<rect width="1024" height="1024" fill="${plate}"/>` : '') +
  extra +
  `<g transform="${place(scale)}">${body}</g></svg>`;

const mark = () =>
  `<path fill="${crownFill()}" d="${crown}"/><path fill="${SCHEME.flame}" d="${flame}"/>`;

/**
 * The themed-icon layer. Android keeps only the alpha channel, so the flame has
 * to be a real hole punched with a mask rather than a lighter fill, or the mark
 * loses its core and reads as a solid blob.
 */
const monochrome = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` +
  `<mask id="m"><g transform="${place(SAFE)}">` +
  `<path fill="#fff" d="${crown}"/><path fill="#000" d="${flame}"/>` +
  `</g></mask>` +
  `<rect width="1024" height="1024" fill="#fff" mask="url(#m)"/></svg>`;

const SOURCES = {
  'icon.svg': svg(mark(), { plate: plateFill(), scale: SQUARE }),
  'foreground.svg': svg(mark(), { scale: SAFE }),
  'monochrome.svg': monochrome(),
  'background.svg':
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` +
    `<defs>${DEFS}</defs><rect width="1024" height="1024" fill="${plateFill()}"/></svg>`,
  'splash.svg': svg(mark(), { scale: 0.86 }),
};

// filename → [source, size, transparent]
const OUTPUTS = [
  ['icon.png', 'icon.svg', 1024, false],
  ['android-icon-foreground.png', 'foreground.svg', 1024, true],
  ['android-icon-background.png', 'background.svg', 1024, false],
  ['android-icon-monochrome.png', 'monochrome.svg', 1024, true],
  ['splash-icon.png', 'splash.svg', 512, true],
  ['favicon.png', 'icon.svg', 48, false],
];

mkdirSync(TMP, { recursive: true });
for (const [name, body] of Object.entries(SOURCES)) {
  writeFileSync(resolve(HERE, name), body);
}

function render(sourceName, outName, size, transparent) {
  // An HTML wrapper, not the .svg directly: a standalone SVG document renders at
  // its intrinsic size and ignores the window, so every output would be 1024.
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    img{display:block;width:100vw;height:100vh}
  </style></head><body><img src="./${sourceName}"></body></html>`;
  const page = resolve(TMP, `${outName}.html`);
  writeFileSync(page, html);
  // The wrapper lives in .tmp/ but references ../<source>, so copy the source in.
  writeFileSync(resolve(TMP, sourceName), SOURCES[sourceName]);

  execFileSync(
    CHROME,
    [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--default-background-color=${transparent ? '00000000' : 'ff000000'}`,
      `--screenshot=${resolve(IMAGES, outName)}`,
      `--window-size=${size},${size}`,
      `file://${page}`,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
}

for (const [outName, sourceName, size, transparent] of OUTPUTS) {
  render(sourceName, outName, size, transparent);
  console.log(`  ${outName.padEnd(30)} ${size}x${size}${transparent ? '  alpha' : ''}`);
}

// ── src/lib/logo.ts ──────────────────────────────────────────────────────────
// Path length is what drives the draw-on animation: stroke-dasharray is set to
// the full length and the offset animated to zero. react-native-svg has no
// reliable getTotalLength() across platforms, so it is measured here instead and
// baked in as a constant.
function pathLength(d) {
  const tokens = d.match(/[MLCZmlcz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const at = (p0, p1, p2, p3, t) => {
    const u = 1 - t;
    return [
      u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
      u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
    ];
  };

  let i = 0;
  let cmd = null;
  let cur = [0, 0];
  let start = [0, 0];
  let total = 0;
  const num = () => Number(tokens[i++]);

  while (i < tokens.length) {
    if (/[MLCZmlcz]/.test(tokens[i])) {
      cmd = tokens[i++];
      if (cmd === 'Z' || cmd === 'z') {
        total += dist(cur, start);
        cur = start;
        cmd = null;
        continue;
      }
    }
    const rel = cmd === cmd?.toLowerCase();
    const pt = () => {
      const x = num();
      const y = num();
      return rel ? [cur[0] + x, cur[1] + y] : [x, y];
    };
    if (cmd === 'M' || cmd === 'm') {
      cur = start = pt();
      cmd = rel ? 'l' : 'L'; // repeated pairs after M are implicit lineto
    } else if (cmd === 'L' || cmd === 'l') {
      const p = pt();
      total += dist(cur, p);
      cur = p;
    } else if (cmd === 'C' || cmd === 'c') {
      const p1 = pt();
      const p2 = pt();
      const p3 = pt();
      let prev = cur;
      for (let k = 1; k <= 64; k++) {
        const q = at(cur, p1, p2, p3, k / 64);
        total += dist(prev, q);
        prev = q;
      }
      cur = p3;
    } else {
      throw new Error(`unsupported path command: ${cmd}`);
    }
  }
  return total;
}

const PAD = 12; // room for the traced stroke, which straddles the outline
const box = {
  x: Math.round(CONTENT.cx - CONTENT.w / 2 - PAD),
  y: Math.round(CONTENT.cy - CONTENT.h / 2 - PAD),
  w: Math.round(CONTENT.w + PAD * 2),
  h: Math.round(CONTENT.h + PAD * 2),
};

const ts = `/**
 * GENERATED by assets/icon-src/build-icons.mjs from assets/logo.svg.
 * Do not edit by hand — edit the SVG and re-run the script.
 *
 * Two paths, because the other six in the export are vectoriser slivers with
 * areas of 4–66 square units against the mark's 600,000; they are invisible at
 * every size the app ever draws.
 *
 * \`length\` is the flattened arc length of each outline, measured at build time.
 * It is what the draw-on animation sets stroke-dasharray to: dash the whole
 * outline, then animate the offset from length to 0 and the mark draws itself.
 * react-native-svg's getTotalLength() is not dependable across platforms, which
 * is why this is a baked constant rather than a runtime measurement.
 *
 * The viewBox is cropped to the mark plus ${PAD} units of padding, so the component
 * fills whatever box it is given instead of carrying the export's dead margin.
 */

export const LOGO = {
  viewBox: '${box.x} ${box.y} ${box.w} ${box.h}',
  /** width / height — the mark is taller than it is wide. */
  aspect: ${(box.w / box.h).toFixed(6)},
  crown: {
    length: ${Math.ceil(pathLength(crown))},
    d: '${crown}',
  },
  flame: {
    length: ${Math.ceil(pathLength(flame))},
    d: '${flame}',
  },
} as const;
`;

const tsPath = resolve(ASSETS, '..', 'src', 'lib', 'logo.ts');
writeFileSync(tsPath, ts);
console.log(`  src/lib/logo.ts                crown=${Math.ceil(pathLength(crown))} flame=${Math.ceil(pathLength(flame))}`);

rmSync(TMP, { recursive: true, force: true });
console.log('\ndone.');

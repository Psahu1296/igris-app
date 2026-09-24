# Igris — the mark

`logo.svg` is the source of truth. Everything else in `images/` is generated from it
by `icon-src/build-icons.mjs`, and `src/lib/logo.ts` is generated too. Edit the SVG,
re-run the script, rebuild. Do not hand-edit the PNGs or `logo.ts`.

```sh
node assets/icon-src/build-icons.mjs
```

---

## 1. What the mark is

A spiked crown — a knight's helm read as heraldry — with a lit core burning at its
centre. It comes from the persona in `maestro/graph.py:67`: *"You are Igris, first
knight of the Shadow Monarch."* Disciplined, formal, economical. *Mild gravitas is
welcome; theatrics are not.*

The core is the part that carries meaning. Tungsten amber `#FFB338` is
`Palette.local` — the colour the whole app uses to say *the Mac answered*. So the
icon is lit in the state the app hopes to be in, and the lane badge inside the app
teaches you to read that colour before you have read a word.

Ground is `#09080E`, a warm-shifted ink — deliberately not `#000` and not a neutral
near-black. Per `src/constants/theme.ts`: *Igris is a knight serving a roadside dhaba
at night, lit by kerosene, not a spaceship.* Kerosene, not neon.

---

## 2. The one real problem, and why the icon is inverted

**The logo was drawn on white.** Its crown is `#14121E`, which is `Palette.surface` —
and against our own ground `#09080E` that is very nearly the same colour. Rendered
as-drawn on the app's plate, the mark is almost invisible at 48px. This was checked
at 48/72/140px, not assumed.

So the icon **inverts the artwork**: the crown takes the amber, and the flame becomes
a white-hot core `#FFF3D6` (warm white, never `#fff`). The mark keeps its
figure-and-glowing-core reading, gains enormous contrast, and stays entirely inside
the app's two-colour language.

| | crown | flame | plate |
|---|---|---|---|
| as Recraft drew it | `#14121E` | `#FFB338` | white |
| **shipped** | `#FFE0A3` → `#FFB338` → `#A9661A` | `#FFF3D6` | `#171320` → `#09080E` |

The original colourway on a cream plate also reads well at 48px — it is just not
dark. If you want it, set `PALETTE = 'asDrawn'` in `build-icons.mjs` and re-run; every
output follows.

### Why the crown is a gradient and not a flat fill

A flat `#FFB338` reads as plastic — a sticker, or a gaming logo. The crown is *metal*,
so it takes a two-stop vertical gradient: a pale highlight where light would catch the
top of a helm, falling to deep bronze in the shade. **`#FFB338` sits at 42%**, the
mark's optical centre, so the icon still reads as `Palette.local` at a glance and the
lane colour keeps its meaning.

The plate gets the same idea in reverse — a warm lift behind the mark falling off to
ink. It is a vignette, not a "gradient background": **at the rim it is exactly
`#09080E`**, so the icon still meets the splash with no seam.

This is the one place the "no gradients" rule below is deliberately broken, and it is
narrow: two stops, low contrast, no gradient *mesh*, and it still reads at 48px. If
you add a third gradient anywhere, you have gone too far.

`src/components/igris-mark.tsx` carries the same stops. If you change them in one
place and not the other, the splash stops landing on the launcher icon — which is the
entire point of the animation.

---

## 3. Geometry — the part that silently breaks icons

Measured from the path data, not guessed. The mark's bbox is **723.76 × 825.74**
centred at **(512.26, 497.32)** in the 1024 canvas.

Its extremes sit on the axes — the top spike is dead centre horizontally, the side
spikes are at mid height — so its **bounding circle diameter is its bbox height**,
825.74. That is exactly the number the adaptive-icon safe zone constrains.

Android composes the foreground on a 108dp canvas, shows at most 72dp, and OEM masks
(Samsung, OnePlus, Pixel) may crop to a **66dp circle**. On a 1024px export:

```
1024 canvas
 ├─ 683px  visible square     (centre 66.7%)
 └─ 626px  guaranteed circle  (centre 61%)   ← the mark must fit here
```

`825.74 × 0.75 = 619.3 ≤ 626`, which is where `SAFE = 0.75` in the build script comes
from. The square icon, which is only ever corner-rounded, uses `SQUARE = 0.80`.

---

## 4. What gets generated

Paths are what `app.json` already points at, so regenerating needs **no config
change**.

| File | Size | Alpha | Content |
|---|---|---|---|
| `images/icon.png` | 1024 | no | Mark on the ink plate @ 0.80 |
| `images/android-icon-foreground.png` | 1024 | **yes** | Mark only @ 0.75 |
| `images/android-icon-background.png` | 1024 | no | Flat `#09080E` |
| `images/android-icon-monochrome.png` | 1024 | **yes** | White silhouette, flame punched out |
| `images/splash-icon.png` | 512 | **yes** | Mark @ 0.86; `app.json` draws it at 76px |
| `images/favicon.png` | 48 | no | Web fallback |

**The monochrome layer uses a `<mask>`, not a lighter fill.** Android 13+ keeps only
the alpha channel for themed icons, so the flame has to be a genuine hole or the mark
collapses into a solid blob and loses its core.

**Rendering is headless Chrome**, because it is already on the machine. Every other
SVG rasteriser — librsvg, Inkscape, ImageMagick, cairosvg — would have been a new
install for one build step. Override with `CHROME=/path/to/binary`. The script
renders through a small HTML wrapper rather than pointing Chrome at the `.svg`
directly, because a standalone SVG document renders at its intrinsic size and ignores
the window, which would make every output 1024px.

`logo.svg` is a Recraft export, so the script also strips two things: 18KB of its 23KB
is a C2PA provenance blob inside `<metadata>`, and the vectoriser left six sub-pixel
slivers (areas of 4–66 square units against the mark's 600,000) that are invisible at
every size. The mark is the first two paths.

### Verify

```sh
sips -g pixelWidth -g pixelHeight -g hasAlpha assets/images/android-icon-*.png
```

`foreground` and `monochrome` must report `hasAlpha: yes`. A foreground exported
opaque gives a full-bleed square on the home screen with the mark lost inside it —
the most common way this goes wrong.

Then rebuild and look, because **Expo regenerates the mipmaps at prebuild and a JS
reload shows you nothing**:

```sh
npx expo prebuild -p android        # NEVER --clean, see CLAUDE.md
cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Check the home screen, the app drawer, the recents switcher, and themed icons
(Settings → Wallpaper & style → Themed icons) — that last one is the only place the
monochrome layer appears, and it is where a bad one is obvious.

---

## 5. The mark draws itself

`src/components/igris-mark.tsx` renders the same two paths live, and can animate them
as the icon's own construction: a tungsten line traces the crown, the core catches,
and the fill floods in to land on **exactly** the artwork on the home screen. The
splash therefore resolves into the launcher icon instead of showing a second,
unrelated logo. `animated-splash.tsx` uses it; the name is its follow-through and
waits on `onDone` rather than a parallel timer that would drift if the draw is
retimed.

The mechanism is `stroke-dasharray`: one dash as long as the whole path, offset a full
length so it sits outside the visible range, then the offset animated to zero. Both
paths are single closed subpaths, which is what makes it read as one continuous
gesture — a mark chopped into fragments would flicker on in pieces.

`LOGO.crown.length` (6095) and `LOGO.flame.length` (630) are flattened arc lengths
measured at build time, because **react-native-svg's `getTotalLength()` is not
dependable across platforms**. That is why they are baked constants.

```
0ms ─────────── 1100ms      crown traces        Easing.inOut(cubic)
      700ms ──── 1120ms     core outlines       Easing.out(cubic)
          900ms ── 1350ms   crown fill floods
           1050ms ─ 1500ms  core lights
             1200ms ─1520ms traced line fades out
```

The line fades last because it is the same tungsten as the fill and straddles the
outline — left on, it would leave the mark a few units fatter than the icon.

`animate={false}` renders the end state, which is the icon exactly — use it for any
static placement. Reduce-motion arrives at the end state rather than playing it
faster, matching what `animated-splash.tsx` already did.

---

## 6. Rules for any future edit

- Keep the mark inside the **626px centred circle**
- Exactly two colours plus the plate — no stray hues
- Plate stays `#09080E`, matching `app.json`, `colors.xml` and `Palette.ground`, or
  the icon shows a seam against the splash
- No text, no gradient mesh, no drop shadow
- Keep each element a **single closed subpath** or the draw animation fragments
- Re-run the build script; never hand-edit `images/*.png` or `src/lib/logo.ts`

---

## 7. Where to get artwork

Kept for the next mark — a wordmark, a Play listing graphic, tab icons.

### Generate

| Site | Why |
|---|---|
| [Recraft](https://www.recraft.ai) | What `logo.svg` came from. Exports real SVG and locks a brand palette, so you get editable vectors instead of a raster to trace |
| [Ideogram](https://ideogram.ai) | Cleanest geometry of the general generators; handles "flat vector emblem" without mushy edges |
| [Midjourney](https://www.midjourney.com) | Best looking, worst controllability. `--style raw`; expect to trace |
| ChatGPT / [DALL·E](https://chatgpt.com) | Weakest edges, but iterates conversationally — good for exploring before committing |

A prompt in this mark's language, if you need a matching piece:

```
Minimalist flat vector emblem. Symmetrical spiked crown / knight's helm silhouette,
front view, heraldic. A narrow vertical almond core at the centre, glowing warm
white. Solid fills, crisp geometric edges, no text, no 3D, no bevel, no drop shadow,
no gradient mesh. Two colours only: tungsten amber #FFB338 and warm dark ink #09080E.
Centred, generous margin, readable at 48 pixels. Style: stamped sigil.
```

### Take an existing mark

| Site | Licence | Note |
|---|---|---|
| [game-icons.net](https://game-icons.net) | CC-BY 3.0 | Hundreds of helms, crowns and shadow motifs as clean SVG, built for exactly this silhouette-at-small-size problem |
| [Lucide](https://lucide.dev) · [Phosphor](https://phosphoricons.com) · [Tabler](https://tabler.io/icons) | ISC / MIT | No attribution. `lucide-react-native` is already a dependency |
| [SVG Repo](https://www.svgrepo.com) | mixed | Huge; filter by licence before downloading |
| [Noun Project](https://thenounproject.com) | CC-BY or paid | Deepest search for obscure subjects |
| [Flaticon](https://www.flaticon.com) · [Icons8](https://icons8.com) | freemium | Attribution unless you pay |

### Tooling

- **[Icon Kitchen](https://icon.kitchen)** — Android adaptive-icon generator; one SVG in, all three layers out with the safe zone handled. `build-icons.mjs` does this for us, but it is the fastest way to sanity-check a new mark.
- **[Maskable.app Editor](https://maskable.app/editor)** — previews a foreground under every launcher mask before you build.
- **[Figma](https://figma.com)** — draw a 626px circle on a 1024px frame as the guide.
- **[SVGOMG](https://jakearchibald.github.io/svgomg/)** — strips generator cruft (it would have caught the C2PA blob and the slivers).

Logo makers — Looka, Brandmark, Hatchful — make startup wordmarks, not launcher
sigils, and none of them will hold a palette. Generate and trace, or recolour a
game-icons helm.

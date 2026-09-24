# igris-app — working notes for Claude

## What this is
An Android app that makes **Igris a system-level assistant on the phone**. It is a *client*
of the `maestro` brain (`../maestro`), not a second brain — the same relationship
`maestro/voice/` has today. The app owns: wake word, STT, TTS, the assistant-role
registration, and lane selection. maestro owns: routing, tools, memory, persona.

**Android only.** `VoiceInteractionService` has no iOS equivalent, and that is the whole
point of the app. `/ios` stays gitignored.

Full plan and the 16 locked decisions: `../.scratch/igris-app/PLAN.md`.

## Commands
| Task | Command | Notes |
|---|---|---|
| Dev server | `npx expo start` | JS only; needs a dev build installed for native modules |
| Typecheck | `npx tsc --noEmit` | run before calling anything done |
| Lint | `npx expo lint` | |
| Doctor | `npx expo-doctor` | dependency/config drift |
| Add a package | `npx expo install <pkg>` | **never** `npm i` — this resolves SDK-compatible versions |
| Dev build (local) | `./gradlew assembleDebug` in `android/` | ~3 min after the first run |
| Dev build (cloud) | `npx eas-cli build -p android --profile development` | ~15 min build, but the free queue has hit 50+ min |
| Sideload APK | `npx eas-cli build -p android --profile preview` | this is how the app ships |
| Install to phone | `adb install -r android/app/build/outputs/apk/debug/app-debug.apk` | `adb` is at `$ANDROID_HOME/platform-tools/adb` |
| Re-sync native | `npx expo prebuild -p android` | **see "Prebuild is one-way" below** |

There is no test suite yet. Typecheck + lint + a real round trip on the phone is the bar.

## Prebuild is one-way — `android/` is source, not build output
The template's default advice ("never edit `android/` by hand", regenerate from config
plugins) **does not apply here**. We ran `expo prebuild` once and committed `android/`,
because Igris needs a `VoiceInteractionService`, a session service, and a microphone
foreground service — none of which have an Expo config plugin, and all of which are
easier to debug as Kotlin you can set a breakpoint in than as JS that generates Kotlin.

Consequences, in order of how much they will bite:
- **Never run `expo prebuild --clean`.** It deletes hand-written Kotlin.
- Adding a library with a config plugin means running `expo prebuild -p android` and then
  reading the diff, keeping our own files. Commit before you prebuild.
- An Expo SDK upgrade is a manual `android/` merge. Accepted cost — see PLAN.md decision #2.

## Architecture
- **Two lanes, and the lane IS the model switch** (PLAN.md decision #8). `local` =
  Mac over Tailscale, running Ollama, all 9 tools, ~1s. `cloud` = Render, running Claude
  via maestro's `PERSONA_MODEL`, 8 tools, ~34s cold start. A health probe picks the lane;
  the active lane is always visible in the UI. **maestro needs no changes for this.**
- **The lane can be pinned** (added 2026-09-24). Tapping the header chip opens
  `components/lane-menu.tsx`: Auto / Mac / Render. A pin overrules the probe, persists
  in SecureStore (`igris.lane`), and is honoured *even when the pinned lane is down* —
  the probe still runs, but only so the chip can turn red and say so. `session.tsx`
  owns this as `lanePref` + `laneReachable`; `lane` is still what requests use.
- **`IgrisLoader`: one motion, the colour is the step** (added 2026-09-24). A pen
  stroke circles the outline over a dimmed body; violet = thinking, pink = working
  (tools), the answering brain's metal = answering, lit and still = idle. A per-step
  motion was tried first — running segments for "working" — and on the phone it read
  as a bug crawling over the logo. Don't reintroduce motion per step. Phases come from maestro's stream (`lib/maestro.ts::phaseOf`: `agent_started` →
  working, everything else → thinking) — the event name used to be thrown away.
  There is deliberately **no answering phase from the stream**: maestro sends the
  whole answer as one `response` frame at `on_chain_end`, so it would last one frame.
  Answering is driven by speech instead — `useSpeakingId()` in `use-speech.ts`, a
  module store shared by every `useSpeech()` caller. Idle loaders in a transcript
  must stay still; only the turn being spoken moves.
- **Theme colour follows the MODE, facts follow the LANE.** `Tint` in `theme.ts` is
  `'auto' | Lane` — exactly `lanePref`. Accents (sigil, orb, composer, chip) use it:
  emerald for Auto, tungsten for Mac, steel for Render. Anything stating a fact about
  a real answer uses `lane` instead: `urlFor`, mic availability, and each turn's
  "via Mac/Render" in `turn.tsx`. Mixing them up either hides which brain answered or
  paints a Render answer gold. The chip shows both: mode as its colour, brain as its icon.
- **The local lane is the *reach* lane, not the fast lane.** Measured from the phone
  on 2026-09-23 over LAN: 30.1s for a direct reply, against 2.8s from Render. maestro's
  `PERSONA_MODEL` is `gpt-4.1-nano`, so the Mac makes a network call to OpenAI — there is
  no Ollama in the path. PLAN.md decision #8 assumed local ≈ 1s; that is not true today,
  and the lane badge should not be read as a speed indicator. What the Mac actually buys
  is tool reach.
- **Even that tool reach is currently broken for dhaba.** maestro's `DHABA_AI_URL` points
  at `https://dhaba-ai.onrender.com`, so a dhaba question from the *local* lane still
  goes out to Render — and Render's dhaba-ai cannot reach Bill-App, which runs on the
  Mac. Point `DHABA_AI_URL` at a local dhaba-ai (`:8001`) with Bill-App on `:5005` before
  trusting any dhaba answer from the phone.
- **The Render lane is deliberately degraded.** A dhaba question there would cost ~78s
  (maestro cold start 33.8s + dhaba-ai cold start 43.9s, sequential — measured 2026-09-22).
  It answers "that needs the Mac" instead of hanging. This is a feature, not a TODO.
- **Auth**: `POST /login` with the owner credentials → a **365-day** token, kept in
  `expo-secure-store` (Android Keystore), **one token per lane** — maestro validates
  bearer tokens against Postgres on every call, so a token only works on lanes sharing
  that database, and the Mac may well point at a local one. maestro has **one `session_token` column per
  credential row**, so an ai-playground login evicts the phone's session — the client must
  auto-relogin on 401, with backoff, because `/login` is rate-limited to 5/minute.
- **`thread_id` depends on role** (`maestro/main.py::_thread_config`). A *demo* session is
  namespaced to `demo:<username>:<session_id>`, but the **owner's `thread_id` is the
  `session_id` the client sends, verbatim**. Since 2026-09-24 the phone starts a
  **new thread on every launch** (`phone-<utc stamp>-<rand>`, `state/session.tsx`) and
  persists nothing; old threads — including `voice-v2`, which the Mac voice loop and
  Alexa share — are opened from Chats. `EXPO_PUBLIC_MAESTRO_SESSION_ID` is gone; a value
  left in `.env` is ignored. Never reopen `voice`: that thread was retired on 2026-06-18
  with poisoned memory, and maestro will resume it without complaint.
- **Voice is all on-device** via `react-native-sherpa-onnx`: mic → streaming STT →
  (network) → Piper `en_GB-alan-medium` TTS. Note this is one stage shorter than
  `maestro/voice/` (`vad.py` → `stt.py` → `brain.py` → `tts.py`): **there is no VAD
  stage, and there cannot be.** `react-native-sherpa-onnx/vad` is a documented
  placeholder whose every function throws "Not yet implemented", so the library's
  claim to cover TTS+STT+VAD in one dependency is only two thirds true. What VAD was
  needed for — knowing the speaker stopped — is built into the streaming recogniser as
  endpoint detection (rule1 2.4s silence, rule2 1.4s + speech, rule3 20s cap).
- **The phone does not recognise speech, and should not try.** Two on-device models were
  tried and both failed. Kroko (zipformer2) hard-crashed the process with `SIGABRT`
  because `modelType: 'auto'` maps it onto the v1 transducer loader, which needs
  `attention_dims` and aborts natively when it is missing — and a native abort cannot be
  caught from JS. The 20M zipformer loaded, then heard "how is the weather in my city
  right now" as "ular in my city". That one is capacity, not configuration: 20M
  parameters at int8 on a phone CPU against the server-class models that set the
  expectation. **Speech goes to maestro's `/stt`** (added 2026-09-23), which runs
  faster-whisper with a domain prompt that knows "Igris" and "dhaba". Measured: whisper
  `small` transcribes in ~1.5s and gets proper nouns right.
- **So the mic needs the Mac.** Render has no Whisper, so `useListening` offers the mic
  only on the local lane and says so on Render rather than failing at the end of an
  utterance.
- **Endpointing is RMS, not a model.** Knowing the speaker stopped was the only job the
  on-device model did that mattered, and `voice/wav.ts::rms` over the captured chunks
  does it with no model at all. Thresholds live at the top of `voice/stt.ts` and were
  tuned on a OnePlus 11R — `SPEECH_RMS` is the one to change if it cuts you off or never
  stops.
- **If you ever reconsider an on-device recogniser**, the model must be an ONLINE type
  (transducer, paraformer, zipformer2_ctc, nemo_ctc, tone_ctc) *and* match the sherpa-onnx
  bundled in the installed package version. Check before trusting a name:
  `strings encoder*.onnx | grep -c attention_dims`. Also beware mixed precision — the
  "mobile" archives ship an int8 joiner with no fp32 twin, and detection will happily
  pair it with an fp32 encoder, which decodes to confident nonsense.
- **Models are never bundled.** They download on first run from GitHub Releases on this
  repo against `assets/manifest.json` (size + MD5 verified — see Gotchas). ~110–160MB.

## The speech engine — verified on device
`src/lib/voice/tts.ts` defines the `Tts` interface and owns the only reference to a
concrete engine, mirroring `maestro/voice/factory.py`. Engine:
**`react-native-sherpa-onnx`** (XDcobra, MIT) — chosen because it covers TTS, STT and
VAD in one native dependency, so Phases 2, 3 and 5 cost one install, not three.

Things that were **not** obvious and cost real time:
- **It has no Expo config plugin.** It relies on Gradle autolinking, so `expo prebuild`
  does not touch `android/` for it at all. Lower risk than a plugin would have been.
- **sherpa wants a model *directory*, not a file.** A Piper/VITS voice needs
  `tokens.txt` and `espeak-ng-data/` for phonemisation; Piper's own `.onnx.json` does
  not provide them. The two-loose-files manifest (v1) could never have worked. Use the
  k2-fsa bundle `vits-piper-en_GB-alan-medium.tar.bz2` — 67MB down, 79MB unpacked.
- **Extraction is a native call**, `extractArchive` from
  `react-native-sherpa-onnx/extraction`, whose descriptors come from
  `listBundledArchives(dir)` and carry `modelId`/`archivePath` (not `name`/`path`).
  It lives in `src/lib/voice/model.ts`, not the asset store, so the store stays generic.
- **Imports are subpath-only**: `/tts`, `/extraction`, `/stt`, `/vad`. The package root
  re-exports almost none of it.
- **`generateSpeech()` does not play audio** — it returns float samples. Use
  `createStreamingTTS()`, which carries its own PCM player (`startPcmPlayer`,
  `writePcmChunk`) and plays while generating. That is also the low-latency path.
- The archive is deleted after extraction; readiness is the unpacked directory, never
  the archive. Keeping both costs 146MB for no benefit.

**Proven on a OnePlus 11R (Android 16) on 2026-09-23**, end to end from a cold install:
manifest fetch → 64MB download → MD5 check → `extractArchive` → `createStreamingTTS` →
audible speech. The unpacked directory is 80.6MB at
`files/models/vits-piper-en_GB-alan-medium/` and carries `en_GB-alan-medium.onnx`,
`tokens.txt` and `espeak-ng-data/`; the archive is gone, as designed. Playback evidence,
if you ever need to re-check it without ears: logcat shows an AudioTrack at
`sampleRate:22050` (Piper's native rate) on `streamType:3` under the app's own pid,
`stop() called with 35700 frames delivered` — 1.62s of audio — created, played and
released with no underruns. Download to speech took under 20s on 5G.

**Expo Go no longer runs this app** — a TurboModule is not in the Expo Go binary. Use
`eas build --profile development` and run Metro against the dev client.

## Two traps that cost real time on 2026-09-23

- **Editing `AndroidManifest.xml` does nothing until you rebuild.** JS changes hot-reload
  through Metro; native manifest changes do not. Adding `RECORD_AUDIO` and tapping the
  mic produced *no dialog and no error* — `PermissionsAndroid.request` cannot prompt for
  a permission the installed APK never declared, and it fails silently. Check with
  `adb shell dumpsys package com.psahu.igris | sed -n '/requested permissions/,/install/p'`
  before debugging the JS. An arm64 incremental rebuild is ~16s, so just rebuild.
- **Model readiness is a filesystem check, so it must not be computed during render.**
  `modelState()` stats the disk. Downloading a model does not re-render the transcript
  screen, so the mic button stayed hidden until the app was restarted. The hooks now
  hold readiness in state and refresh it via `useFocusEffect`, which fires on first
  focus and again when you come back from the download screen.

## Conventions
- Route files live in `src/app/` and **only** route files. Components, hooks and clients
  live in `src/components/`, `src/hooks/`, `src/lib/`.
- Dark theme only, hardcoded. Igris launches over other apps from the power-button
  gesture; a light flash is a bug, and a theme toggle is not worth a settings row.
- Comment density matches `maestro`: comments say *why* (the bug, the measurement, the
  tradeoff), not *what*. See `maestro/config.py` for the house style.
- **Expo ships breaking changes every SDK.** Before using an Expo/EAS/RN API, check the
  `expo` major in `package.json` and read
  `https://docs.expo.dev/versions/v<major>.0.0/` — do not answer from training data.

## Do not touch
- `.env` — real secrets, gitignored. Keep `.env.example` in sync.
- `android/app/src/main/java/com/psahu/igris/*.kt` hand-written services — regenerating
  them is what `--clean` would do, and it is never what you want.

## Gotchas
- **Local builds need these two exports** (installed 2026-09-23 via Homebrew; the JDK is
  keg-only so it is deliberately *not* on PATH):
  ```sh
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
  export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
  ```
  `android/local.properties` points Gradle at that SDK and is gitignored, so every
  machine sets its own. Versions are pinned by the project, not chosen: compileSdk 36,
  NDK 27.1.12297006, CMake 3.30.5, Gradle 9.3.1, JDK 17.
- **"Tailscale connected" does not mean the Mac lane works.** Both devices can show
  as connected while the chip says Render: the tailnet only carries the packets, and
  the probe needs maestro *listening* on the Mac. Check
  `lsof -nP -iTCP:8000 -sTCP:LISTEN`, then `curl <LOCAL_URL>/health` from the Mac.
  maestro must also be started with `--host 0.0.0.0` — uvicorn's default `127.0.0.1`
  is unreachable from the tailnet even when it is running.
- **Every maestro request pays ~2s to reach Postgres before doing anything.** Measured
  2026-09-24: maestro's database is on Railway (`thomas.proxy.rlwy.net`, despite the
  workspace note that Railway is gone) — ~1.9–2.1s to open a connection, ~320ms per
  query. `chat_history._connect()` and `demo_auth._connect()` open a NEW connection
  per call, and `validate_session` runs on every authenticated request. So opening a
  thread from Chats costs ~5s (auth + query), and every chat turn carries ~6s of pure
  connection setup (auth + two `chat_history.append`s). The app now shows "Opening
  conversation…" instead of a blank screen, but the fix is server-side: one shared
  `psycopg_pool.AsyncConnectionPool` (already in requirements) opened in the lifespan.
- The "Local" lane is silently dead when the Mac is asleep. Health-probe every turn and
  fall back, never hang.
- Porcupine needs a Picovoice AccessKey at runtime. It is a secret: `.env`, not the repo.
- `expo-file-system` on SDK 57 exposes **no SHA-256** — only `md5`. Asset integrity is
  therefore size + MD5, which catches a truncated or corrupt download. It is not a
  tamper check; HTTPS to a release we control is what covers that. Don't claim otherwise.
- **The app icon is generated, not hand-made.** `assets/logo.svg` is the source;
  `node assets/icon-src/build-icons.mjs` regenerates every PNG in `assets/images/`
  plus `src/lib/logo.ts`. Never hand-edit those outputs. Two things it exists to get
  right: the mark must fit a **626px centred circle** on the 1024 canvas (OEM masks
  crop adaptive icons to 66dp), and the monochrome layer needs a real alpha channel
  with the flame punched out by a `<mask>` — Android keeps only alpha for themed
  icons. Full reasoning in `assets/ICON_BRIEF.md`.
- **The logo was drawn on white and had to be inverted.** Recraft gave us a `#14121E`
  crown, which is `Palette.surface` and therefore nearly invisible against our own
  `#09080E` ground — checked at 48/72/140px. The icon puts the amber on the crown and
  a warm white `#FFF3D6` in the core instead. If you re-export the logo, re-check it
  on the ink plate at 48px before believing it.
- **A stale `autolinking.json` can break a clean build with a package name that exists
  nowhere.** On 2026-09-24 `compileDebugJavaWithJavac` failed with `package com.igris
  does not exist` — and `com.igris` is in no source file, no commit, and no config.
  It came from `android/build/generated/autolinking/autolinking.json`, an orphaned
  artifact. `expo prebuild` deletes `android/app/build` but leaves `android/build`, so
  Gradle regenerated `ReactNativeApplicationEntryPoint.java` from a config it thought
  was up to date. Running `npx expo-modules-autolinking react-native-config --platform
  android` by hand printed the correct `com.psahu.igris`, which is how the staleness
  was proved. Fix: `rm -rf android/build/generated/autolinking
  android/app/build/generated/autolinking` and rebuild — 17s.
- **`expo prebuild` prints "Clearing android" even without `--clean`.** The warning
  above says never to run `--clean` because it deletes hand-written Kotlin; be aware
  plain prebuild clears too. Nothing has been lost yet only because the hand-written
  services do not exist yet. Commit `android/` before every prebuild and read the diff.
- **Never read a Gradle build's exit code through a pipe.** `./gradlew ... | tail -30`
  reports `tail`'s status, so a failed build looks like a pass. Redirect to a log and
  check `$?`, or set `-o pipefail`.
- **Icon changes need a prebuild, not a reload.** Expo regenerates the Android mipmaps
  during `expo prebuild -p android`; Metro will happily show you the old launcher icon
  forever. Same class of trap as the `AndroidManifest.xml` one above.
- Models go in `Paths.document`, never `Paths.cache`. Android purges the cache under
  storage pressure, and losing the 63MB voice looks like Igris going mute for no reason.
- maestro's `/chat/stream` is **SSE** (`EventSourceResponse`). RN's `fetch` has no
  native SSE support — use an SSE client library or XHR streaming, not `EventSource`.
- **SSE frames from maestro are CRLF-delimited.** sse-starlette's `ServerSentEvent`
  defaults to `DEFAULT_SEPARATOR = "\r\n"` and maestro never passes `sep`, so frames
  end `\r\n\r\n`. That contains no two adjacent `\n`, so a parser scanning for
  `\n\n` silently yields zero frames and every turn dies as "Igris closed the
  connection without answering". `src/lib/sse.ts` normalises CRLF/CR/LF and holds back
  a chunk-trailing `\r` so a chunk that ends between CR and LF cannot invent a blank
  line. If you touch that parser, re-check those two cases by hand — a whole-stream
  test passes even when both are broken.
- **`KeyboardAvoidingView` does nothing on this app.** SDK 57 enables edge-to-edge by
  default, which makes the manifest's `adjustResize` a no-op on Android 15+, so the
  window never resizes and there is nothing for it to react to — verified on a OnePlus
  11R (Android 16), composer sat under the IME with the send button untappable. Expo's
  keyboard guide ("on Android just mounting it is enough") assumes adjustResize is live
  and is wrong here. `src/lib/use-keyboard-inset.ts` reads RN's `keyboardDidShow`
  height instead, which *does* fire under edge-to-edge. Reanimated's
  `useAnimatedKeyboard` is the other no-dependency option but is deprecated and seizes
  inset management app-wide, which fights safe-area-context.
- **Phone actions go through our own native module, `modules/igris-device`** (Kotlin,
  autolinked at Gradle time — no prebuild needed). maestro plans the action
  (`maestro/agents/device.py`), `lib/maestro.ts` passes the `device_action` frame
  through `parseDeviceAction`, `lib/device.ts` performs it, and the turn shows a chip
  with the real outcome. **Not `Linking.sendIntent`**: RN puts every JS number extra as
  a Double, and the Clock reads `EXTRA_HOUR` with `getIntExtra` — the hour silently
  becomes 0. Measured on ColorOS: `SET_ALARM` + `SKIP_UI` works silently;
  `DISMISS_ALARM` does nothing for upcoming or ringing alarms (it opens the list). A
  ringing alarm's notification has Snooze/✕ actions — the notification-listener route.
- **Calls never ring on maestro's word alone.** maestro sends only a name
  (`{kind:'call', name}`); the phone resolves it in its own contacts. Non-favourites
  stop at a confirm card (tap, or a typed/spoken "yes" when there is exactly one
  candidate). Quick-call favourites (`lib/favourites.ts`, SecureStore
  `igris.favourites`, managed at `/favourites`) ring after a `COUNTDOWN_MS` (3s)
  cancellable countdown — and only when exactly ONE favourite matches the alias, full
  name or first name. Keep both rules: STT mishears names, and a wrong auto-dial is
  the one failure here that embarrasses the user in front of someone else.
- **Two voices, split per sentence** (`lib/voice/language.ts`, `tts.ts` `MixedTts`).
  Piper Alan is English-only (Devanagari → silence, romanized Hindi → English letter
  sounds), so Hindi/Hinglish sentences go to Google TTS's Hindi voice via our own
  `HindiVoice.kt` — **not expo-speech**, which builds `Locale("hi-IN")` (wrong: falls
  back to English), crashes on a null voice list, and never rejects in JS, so the
  speaking loop hung. Only an offline Hindi voice is used, so notification text never reaches
  Google; without one, Alan reads it. Hinglish is detected by a word list that
  deliberately excludes words English shares ("to", "do", "main").
- **Notifications stay on the phone** (`lib/notifications.ts`,
  `IgrisNotificationListener.kt`). maestro sends only `notify.read` / `notify.reply`;
  the phone reads the shade, speaks it with on-device TTS, and holds it in the turn's
  memory — never sent, saved, or put in the copied transcript. Only chat apps in
  `APPS` are read (no OTPs or bank alerts aloud). Replies stop at a confirm card like
  calls. Access is a Settings switch, not a runtime permission: the first request opens
  it and fails with instructions. **Sideloaded builds can't flip that switch**: Android
  13+ "restricted settings" rejects it with "permission denied", ColorOS hides the
  "Allow restricted settings" menu, and `appops set` is refused to adb. What works:
  `adb shell cmd notification allow_listener com.psahu.igris/expo.modules.igrisdevice.IgrisNotificationListener`.
  Measured 2026-09-24. `alarm.stop` presses a RINGING alarm's button — told
  from the "upcoming alarm" notice by full-screen + Snooze, because that notice's
  Dismiss skips the next alarm.
- Device actions need a maestro with `agents/device.py`; notification actions need the
  2026-09-24 version (`notify` capability).
- maestro's `BILL_APP_URL` (`config.py:40`) is dead config, referenced nowhere. The dhaba
  path is maestro → `DHABA_AI_URL/agent/chat` → dhaba-ai → Bill-App.

## Working agreement
Pushpendra is a strong React/React Native/TypeScript engineer and new to Android/Kotlin.
For **this repo** the teaching rule is lifted (PLAN.md decision #16): write Kotlin and TS
directly, then explain what changed and why. Run typecheck and lint and report the result.

- Smallest change that solves the problem. No speculative abstraction.
- No new dependencies without asking, and `npx expo install`, never `npm i`.
- Never commit or push unless asked. Never commit `.env` or a keystore.
- If a step was skipped (no device, no SDK, no network), say so — never call it verified.

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
  `session_id` the client sends, verbatim**. So `EXPO_PUBLIC_MAESTRO_SESSION_ID` decides
  whether the phone continues the Mac voice loop's conversation or starts its own — it
  must match `MAESTRO_SESSION_ID` in `maestro/.env` to share one continuous Igris.
  That value is **`voice-v2`**, not `voice`: the `voice` thread was retired on 2026-06-18
  with poisoned memory, and maestro will resume it without complaint if you ask it to.
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
- The "Local" lane is silently dead when the Mac is asleep. Health-probe every turn and
  fall back, never hang.
- Porcupine needs a Picovoice AccessKey at runtime. It is a secret: `.env`, not the repo.
- `expo-file-system` on SDK 57 exposes **no SHA-256** — only `md5`. Asset integrity is
  therefore size + MD5, which catches a truncated or corrupt download. It is not a
  tamper check; HTTPS to a release we control is what covers that. Don't claim otherwise.
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

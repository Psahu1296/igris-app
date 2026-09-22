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
| Dev build (cloud) | `npx eas-cli build -p android --profile development` | ~15 min |
| Sideload APK | `npx eas-cli build -p android --profile preview` | this is how the app ships |
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
- **Voice is all on-device** via `react-native-sherpa-onnx`: silero VAD → sherpa STT →
  (network) → Piper `en_GB-alan-medium` TTS. Same pipeline shape as `maestro/voice/`
  (`vad.py` → `stt.py` → `brain.py` → `tts.py`), so read those when in doubt about ordering.
- **Models are never bundled.** They download on first run from GitHub Releases on this
  repo against `assets/manifest.json` (sha256-verified, resumable). ~110–160MB.

## The speech engine — installed
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

**Expo Go no longer runs this app** — a TurboModule is not in the Expo Go binary. Use
`eas build --profile development` and run Metro against the dev client.

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
- **No JDK and no Android SDK are installed on this machine** (checked 2026-09-22). Local
  builds are impossible until JDK 17 + cmdline-tools are installed; until then every
  native change is a ~15 min EAS cloud build. Install them before starting Phase 4.
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

# igris-app

Igris as an Android system assistant — a React Native client for the
[maestro](../maestro) brain.

Wake word and voice run on the phone. Routing, tools, memory and persona stay in maestro.
Two lanes: the Mac over Tailscale (fast, free, all 9 tools) or Render (slower, Claude,
degraded tool set).

- Plan and the 16 locked decisions: [`../.scratch/igris-app/PLAN.md`](../.scratch/igris-app/PLAN.md)
- Working notes and gotchas: [`CLAUDE.md`](CLAUDE.md)

## Status

**Phase 2.** Sign-in, lane probe, streaming transcript, model download and extraction,
and spoken answers via sherpa-onnx. Wake word and speech-to-text are Phases 3 and 5.

## Quick start

```bash
npm install
cp .env.example .env     # fill in your tailnet host
npx eas build -p android --profile development   # Expo Go will not run this
npx expo start
```

Android only. `npx expo prebuild --clean` will delete hand-written Kotlin — see CLAUDE.md.

# Desktop App Icon Design

**Date:** 2026-03-23

**Status:** Approved for planning

## Goal

Replace the default Electron desktop icon with a repo-managed EASYWhisper product icon that matches the current app visual language and can be packaged into Windows and macOS builds.

## Context

The desktop app now packages successfully on Windows, but `electron-builder` still falls back to the default Electron icon. The current UI uses a light, glassy palette with cyan and green accents, so the icon should look like it belongs to the same product family instead of a generic recorder utility.

## Constraints

- The icon must stay legible at small desktop sizes, especially `16x16`, `32x32`, and taskbar/dock scales.
- Windows packaging should stop emitting the `default Electron icon is used` warning.
- The source of truth should live in the repo as editable vector artwork, not only as checked-in binaries.
- Packaging should remain reproducible on a clean machine through repo scripts.
- Windows packaging must keep the already-verified `signAndEditExecutable=false` workaround.
- macOS packaging should be wired for the same icon family even though this Windows machine cannot fully verify notarization or Finder appearance.

## Chosen Direction

### Visual language

- Base shape: rounded square tile
- Background: deep teal-blue base around `#0f3d4c`
- Foreground: warm off-white microphone around `#f8fafc`
- Accent: cyan-to-green acceleration wedge around `#22c7d6 -> #16a34a`
- Style: geometric, clean, tool-like, no soft cartoon shading

### Symbol composition

- A centered microphone body with thick silhouette for small-size readability
- A short stand and base integrated into the same bold shape family
- A forward-leaning acceleration element on the upper-right side, treated like a thrust panel rather than detailed fire
- No fine waveform detail, spark particles, or thin strokes that disappear when rasterized

### Packaging strategy

- Keep `apps/desktop/build/icon.svg` as the editable source asset
- Generate `apps/desktop/build/icon.ico` and `apps/desktop/build/icon.icns` from the SVG via a repo script
- Point `electron-builder` Windows and macOS config to those generated assets
- Invoke icon generation from packaging scripts so it is not a manual pre-step

## Alternatives Considered

### 1. Check in only binary icon files

Rejected. It removes the editable source of truth and makes future design changes awkward.

### 2. Use an audio waveform or plain microphone icon

Rejected. It is too generic and does not express the "fast local transcription" positioning clearly enough.

### 3. Use only an SVG asset and let packaging infer platform icons

Rejected. Windows and macOS packaging are more predictable with explicit `.ico` and `.icns` assets, and the current goal is to remove ambiguity from the build pipeline.

## Implementation Outline

1. Create the approved SVG icon source in `apps/desktop/build/icon.svg`.
2. Add a deterministic icon generation script that writes `.ico` and `.icns`.
3. Add automated tests for the generator and for `package.json` icon wiring.
4. Update packaging scripts to generate icons before `package:win` / `package:mac`.
5. Re-run Windows packaging and confirm the default Electron icon warning disappears.

## Risks

- Generating `.icns` on Windows may require adding small build-time dependencies.
- The SVG may look good at large sizes but lose clarity when rasterized small; this must be checked explicitly in the generator verification task.
- If icon generation depends on external native tooling, the build becomes brittle. The implementation should prefer Node-based generation inside the workspace.

## Testing Expectations

- Targeted generator test proves `.ico` and `.icns` are produced from the source SVG
- Targeted packaging-config test proves `package.json` points at the generated icon files and calls the generator before packaging
- Full `pnpm test:run`
- Fresh `pnpm --filter @easywhisper/desktop package:win`
- Packaging output should no longer mention the default Electron icon warning

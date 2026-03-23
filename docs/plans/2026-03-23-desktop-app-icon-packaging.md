# Desktop App Icon And Packaging Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a repo-managed EASYWhisper app icon and wire it into desktop packaging so Windows builds stop using the default Electron icon.

**Architecture:** Keep a single editable SVG source in `apps/desktop/build/`, generate platform packaging assets from that source with a repo script, and call that generator from packaging scripts. Verify the behavior with targeted tests for both asset generation and `package.json` packaging config before re-running the full Windows packaging flow.

**Tech Stack:** Electron, electron-builder, Vitest, Node.js scripts, SVG source art, generated `.ico` / `.icns` assets

---

### Task 1: Add The Icon Source And Generator Script

**Files:**
- Create: `apps/desktop/build/icon.svg`
- Create: `apps/desktop/scripts/generate_app_icons.mjs`
- Modify: `apps/desktop/package.json`
- Test: `apps/desktop/electron/__tests__/packaging/generateAppIcons.test.ts`

**Step 1: Write the failing test**

Create `apps/desktop/electron/__tests__/packaging/generateAppIcons.test.ts` with a node-environment test that:

- creates a temporary desktop sandbox with `build/icon.svg`
- runs `apps/desktop/scripts/generate_app_icons.mjs`
- expects `build/icon.ico` and `build/icon.icns` to exist and be non-empty
- expects the script to fail clearly if `build/icon.svg` is missing

Sketch:

```ts
it('generates ico and icns assets from the repo svg source', async () => {
  await writeFile(path.join(buildDir, 'icon.svg'), svgFixture, 'utf8')

  await execFileAsync(process.execPath, [scriptPath], {
    cwd: desktopRoot,
    env: { ...process.env, EASYWHISPER_DESKTOP_ROOT: sandboxRoot }
  })

  await expect(stat(path.join(buildDir, 'icon.ico'))).resolves.toMatchObject({
    size: expect.any(Number)
  })
  await expect(stat(path.join(buildDir, 'icon.icns'))).resolves.toMatchObject({
    size: expect.any(Number)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @easywhisper/desktop test:run -- generateAppIcons`

Expected: FAIL because `generate_app_icons.mjs` and/or the icon source do not exist yet.

**Step 3: Write minimal implementation**

- Add `apps/desktop/build/icon.svg` using the approved rounded-square / microphone / acceleration design
- Add `apps/desktop/scripts/generate_app_icons.mjs`
- In the script:
  - resolve desktop root from `EASYWHISPER_DESKTOP_ROOT` fallback to the repo desktop directory
  - load `build/icon.svg`
  - render PNG sizes from the SVG with a Node-friendly image tool
  - generate `build/icon.ico`
  - generate `build/icon.icns`
  - fail with a clear error when the SVG source is missing or generation produces empty files
- Add any required dev dependencies to `apps/desktop/package.json` and install them

Minimal implementation sketch:

```js
const buildDir = path.join(desktopRoot, 'build')
const svgPath = path.join(buildDir, 'icon.svg')
const icoPath = path.join(buildDir, 'icon.ico')
const icnsPath = path.join(buildDir, 'icon.icns')

await assertReadableFile(svgPath, 'build/icon.svg is missing')
const pngBuffers = await Promise.all(SIZES.map((size) => renderPng(svgPath, size)))
await writeFile(icoPath, await pngToIco(pngBuffers))
await writeFile(icnsPath, buildIcnsFromPngs(pngBuffers))
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @easywhisper/desktop test:run -- generateAppIcons`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/build/icon.svg apps/desktop/scripts/generate_app_icons.mjs apps/desktop/package.json apps/desktop/electron/__tests__/packaging/generateAppIcons.test.ts
git commit -m "feat(desktop): add app icon generator"
```

### Task 2: Wire Packaging Config To The Generated Icon Assets

**Files:**
- Modify: `apps/desktop/package.json`
- Test: `apps/desktop/electron/__tests__/whisper/stageWindowsWhisperRuntime.test.ts`
- Optionally Create: `apps/desktop/electron/__tests__/packaging/packageIconConfig.test.ts`

**Step 1: Write the failing test**

Add a targeted test that asserts:

- `build.win.icon` is `build/icon.ico`
- `build.mac.icon` is `build/icon.icns`
- `package:win`, `package:win:dir`, `package:mac`, and `package:mac:dir` each call `pnpm run icons:build`

Sketch:

```ts
it('uses generated app icon assets for desktop packaging', async () => {
  const pkg = JSON.parse(await readFile(packageJsonPath, 'utf8'))

  expect(pkg.build.win.icon).toBe('build/icon.ico')
  expect(pkg.build.mac.icon).toBe('build/icon.icns')
  expect(pkg.scripts['package:win']).toContain('pnpm run icons:build')
  expect(pkg.scripts['package:mac']).toContain('pnpm run icons:build')
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @easywhisper/desktop test:run -- stageWindowsWhisperRuntime`

Expected: FAIL because the icon paths and package scripts are not wired yet.

**Step 3: Write minimal implementation**

Update `apps/desktop/package.json`:

- add an `icons:build` script that runs `node ./scripts/generate_app_icons.mjs`
- prepend `pnpm run icons:build &&` to desktop packaging scripts
- set:

```json
"mac": {
  "icon": "build/icon.icns",
  "category": "public.app-category.productivity",
  "target": ["dir", "dmg"]
},
"win": {
  "icon": "build/icon.ico",
  "target": ["dir", "nsis"]
}
```

**Step 4: Run test to verify it passes**

Run:
- `pnpm --filter @easywhisper/desktop test:run -- stageWindowsWhisperRuntime`
- `pnpm --filter @easywhisper/desktop test:run -- packageIconConfig`

Expected: PASS

**Step 5: Commit**

```bash
git add apps/desktop/package.json apps/desktop/electron/__tests__/whisper/stageWindowsWhisperRuntime.test.ts apps/desktop/electron/__tests__/packaging/packageIconConfig.test.ts
git commit -m "feat(desktop): wire app icon into packaging"
```

### Task 3: Document The Workflow And Verify Real Packaging

**Files:**
- Modify: `dev-plan.md`
- Modify: `README.md`
- Optionally Create: `apps/desktop/build/README.md`

**Step 1: Write the failing test**

Write or extend a packaging regression test that asserts the icon build script is a required pre-step for Windows packaging. If Task 2 already covers that behavior, reuse the existing targeted test and skip a duplicate test file.

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @easywhisper/desktop test:run -- stageWindowsWhisperRuntime`

Expected: FAIL until the script wiring and docs-related references are aligned.

**Step 3: Write minimal implementation**

- Update `dev-plan.md` current progress to note that app icon packaging is in progress or complete
- Update `README.md` with a short packaging note documenting the icon-generation step if desktop packaging instructions live there
- If helpful, add `apps/desktop/build/README.md` describing:
  - `icon.svg` as source of truth
  - generated `icon.ico` and `icon.icns`
  - the command `pnpm --filter @easywhisper/desktop run icons:build`

**Step 4: Run verification**

Run:

```bash
pnpm --filter @easywhisper/desktop test:run -- generateAppIcons
pnpm --filter @easywhisper/desktop test:run -- stageWindowsWhisperRuntime
pnpm test:run
pnpm --filter @easywhisper/desktop package:win
```

Expected:

- targeted tests pass
- full workspace tests pass
- Windows packaging succeeds
- electron-builder output no longer says `default Electron icon is used`
- `apps/desktop/release/EASYWhisper-0.1.0-alpha-x64-setup.exe` is regenerated successfully

**Step 5: Commit**

```bash
git add dev-plan.md README.md apps/desktop/build/README.md
git commit -m "docs: document desktop app icon packaging"
```

# Desktop Workspace Simplification + Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Home workspace focused on frequent actions while moving setup-heavy controls into a dedicated Settings page, and add folder-open shortcuts for model/output directories.

**Architecture:** Split UI responsibilities by route: `/` handles daily workflow (import, queue, output format toggles, AI step toggles), while `/settings` owns setup/configuration. Extend existing Electron IPC layers with two new folder-open actions (model/output) and keep store update flows unchanged (`whisperStore.updateSettings`). Refactor import UX by composing existing drag-drop and URL input into a unified import card without changing queue execution logic.

**Tech Stack:** Vue 3 + Pinia + Vue Router + Naive UI, Electron IPC (main/preload/renderer), Vitest + Vue Test Utils.

---

## File Structure Map (before implementation)

### Create
- `apps/desktop/src/views/SettingsView.vue`
  - Dedicated Settings page containing: model settings, transcription settings, download settings, folder shortcuts.
- `apps/desktop/src/components/ImportPanel.vue`
  - Unified import card composing local file drop/picker and yt-dlp URL batch input.
- `apps/desktop/src/components/AiQuickToggles.vue`
  - Home-only compact AI step checkbox/switch block (translate/summary/correct etc.).
- `apps/desktop/src/__tests__/components/ImportPanel.test.ts`
  - Renderer interaction coverage for unified import UX.

### Modify
- `apps/desktop/src/router/index.ts`
  - Add `/settings` route.
- `apps/desktop/src/App.vue`
  - Add top app shell/header with gear navigation and route-aware title/actions.
- `apps/desktop/src/views/HomeView.vue`
  - Remove setup-heavy blocks; render ImportPanel + QueueTable + output format toggles + AiQuickToggles.
- `apps/desktop/src/components/ModelSelector.vue`
  - Remove direct model-download emphasis from Home usage; adapt for Settings embedding as needed.
- `apps/desktop/src/components/SettingsPanel.vue`
  - Split/present only transcription + download settings concerns and folder shortcuts area integration.
- `apps/desktop/electron/main/ipc/modelHandlers.ts`
  - Add model folder open handler.
- `apps/desktop/electron/main/ipc/settings.ts`
  - Add output folder open handler (reads current settings, applies fallback).
- `apps/desktop/electron/preload/index.ts`
  - Expose `openModelFolder` and `openOutputFolder` APIs.
- `apps/desktop/src/types/global.d.ts`
  - Add typings for new preload APIs.
- `packages/shared/src/ipc.ts`
  - Add channel constants for folder-open handlers.
- `packages/shared/src/types.ts`
  - Add request/response types for open-folder actions.
- `apps/desktop/electron/__tests__/ipc/coreHandlers.test.ts`
  - Add tests for model/output folder handlers and fallback behavior.

### Keep unchanged (must not regress)
- `apps/desktop/src/stores/queue.ts` (enqueue/processing pipeline)
- `apps/desktop/src/stores/whisper.ts` (settings persistence and model download progress)

---

## Task 1: Add IPC contracts for folder-open actions

**Files:**
- Modify: `packages/shared/src/ipc.ts`
- Modify: `packages/shared/src/types.ts`
- Modify: `apps/desktop/electron/preload/index.ts`
- Modify: `apps/desktop/src/types/global.d.ts`
- Test: `apps/desktop/electron/__tests__/ipc/coreHandlers.test.ts`

- [x] **Step 1: Write failing IPC contract tests for new channels**
  - In `coreHandlers.test.ts`, add expectations that handlers exist for:
    - `model:open-folder`
    - `settings:open-output-folder`
  - Add response-shape expectations:
    - `{ ok: true, path: string }` on success
    - `{ ok: false, error: string }` on failure

- [ ] **Step 2: Run test to verify failure**
  - Run: `pnpm --filter @fosswhisper/desktop test:run apps/desktop/electron/__tests__/ipc/coreHandlers.test.ts`
  - Expected: FAIL because channels/types/APIs are not implemented.

- [x] **Step 3: Add shared channel and type definitions (minimal)**
  - Add `MODEL_OPEN_FOLDER` and `SETTINGS_OPEN_OUTPUT_FOLDER` to `IPC_CHANNELS`.
  - Add typed payload/response interfaces in `packages/shared/src/types.ts`.
  - Update preload API surface and renderer typings to expose:
    - `openModelFolder(): Promise<OpenFolderResponse>`
    - `openOutputFolder(): Promise<OpenFolderResponse>`

- [x] **Step 4: Run targeted tests and typecheck**
  - Run: `pnpm --filter @fosswhisper/desktop test:run apps/desktop/electron/__tests__/ipc/coreHandlers.test.ts`
  - Run: `pnpm --filter @fosswhisper/desktop typecheck`
  - Expected: still failing on handler logic (next task), but no type export/import errors.

- [ ] **Step 5: Commit IPC contract scaffolding**
```bash
git add packages/shared/src/ipc.ts packages/shared/src/types.ts apps/desktop/electron/preload/index.ts apps/desktop/src/types/global.d.ts apps/desktop/electron/__tests__/ipc/coreHandlers.test.ts
git commit -m "feat(desktop): add folder-open IPC contracts"
```

---

## Task 2: Implement main-process folder-open handlers

**Files:**
- Modify: `apps/desktop/electron/main/ipc/modelHandlers.ts`
- Modify: `apps/desktop/electron/main/ipc/settings.ts`
- Test: `apps/desktop/electron/__tests__/ipc/coreHandlers.test.ts`

- [x] **Step 1: Write failing test for outputDir fallback behavior**
  - Add test cases to assert:
    1. output folder handler uses non-empty `outputDir` from settings.
    2. output folder handler falls back to default output path when `outputDir` is empty.
  - Mock Electron shell open call and assert it receives resolved path.

- [ ] **Step 2: Run test to verify it fails**
  - Run: `pnpm --filter @fosswhisper/desktop test:run apps/desktop/electron/__tests__/ipc/coreHandlers.test.ts`
  - Expected: FAIL due to missing handler/path resolution.

- [x] **Step 3: Implement model folder handler**
  - In `modelHandlers.ts`:
    - Resolve model dir from same base used by model download (`app.getPath('userData')/models`).
    - Ensure dir exists before opening.
    - Open via Electron shell (`showItemInFolder` or `openPath` consistently).
    - Return typed success/failure response.

- [x] **Step 4: Implement output folder handler with fallback**
  - In `settings.ts`:
    - Read current settings from `SettingsManager`.
    - Use `settings.outputDir` when non-empty.
    - Else fallback to app default output dir used by workflow.
    - Ensure directory exists, then open folder, and return typed response.

- [x] **Step 5: Run tests to verify pass**
  - Run: `pnpm --filter @fosswhisper/desktop test:run apps/desktop/electron/__tests__/ipc/coreHandlers.test.ts`
  - Expected: PASS for new handler cases.

- [ ] **Step 6: Commit handler implementation**
```bash
git add apps/desktop/electron/main/ipc/modelHandlers.ts apps/desktop/electron/main/ipc/settings.ts apps/desktop/electron/__tests__/ipc/coreHandlers.test.ts
git commit -m "feat(desktop): implement open model/output folder handlers"
```

---

## Task 3: Introduce Settings page routing and app shell navigation

**Files:**
- Modify: `apps/desktop/src/router/index.ts`
- Modify: `apps/desktop/src/App.vue`
- Create: `apps/desktop/src/views/SettingsView.vue`
- Test: `apps/desktop/src/__tests__/components/*` (create/update route-level UI test if present conventions exist)

- [x] **Step 1: Write failing route test (or component mount assertion) for `/settings`**
  - Add test that route `/settings` renders SettingsView and gear button navigates from Home.
  - If no existing route tests, add minimal mount-based route navigation test.

- [x] **Step 2: Run test to verify failure**
  - Run: `pnpm --filter @fosswhisper/desktop test:run`
  - Expected: FAIL due to missing route/view/nav shell.

- [x] **Step 3: Add `/settings` route and top shell**
  - Router: define `settings` route.
  - App shell: add header/title area + route container.
  - Add Home gear action and Settings “Back to Workspace” action.

- [x] **Step 4: Implement `SettingsView.vue` skeleton with three sections**
  - Section order:
    1. Model settings
    2. Transcription settings
    3. Download settings
  - Wire to existing `whisperStore` settings lifecycle.

- [x] **Step 5: Run tests/typecheck**
  - Run: `pnpm --filter @fosswhisper/desktop test:run`
  - Run: `pnpm --filter @fosswhisper/desktop typecheck`
  - Expected: route/nav behavior passes; next tasks may still fail pending UI refactor.

- [ ] **Step 6: Commit navigation + settings route**
```bash
git add apps/desktop/src/router/index.ts apps/desktop/src/App.vue apps/desktop/src/views/SettingsView.vue
git commit -m "feat(desktop): add settings page and top-level navigation"
```

---

## Task 4: Refactor Home into workflow-only layout

**Files:**
- Modify: `apps/desktop/src/views/HomeView.vue`
- Create: `apps/desktop/src/components/ImportPanel.vue`
- Create: `apps/desktop/src/components/AiQuickToggles.vue`
- Modify: `apps/desktop/src/components/UrlInput.vue` (if reused as child) OR keep and compose unchanged
- Modify: `apps/desktop/src/components/DropZone.vue` (only if needed for composition)
- Test: `apps/desktop/src/__tests__/components/ImportPanel.test.ts`
- Test: `apps/desktop/src/__tests__/components/DropZone.test.ts` (adjust selectors if structure changes)

- [x] **Step 1: Write failing component tests for unified import panel**
  - Test cases:
    - Drag/drop valid+invalid files enqueues only supported files.
    - URL input submit enqueues parsed URLs.
    - Both actions exist in one card on Home.

- [ ] **Step 2: Run tests to confirm failure**
  - Run: `pnpm --filter @fosswhisper/desktop test:run apps/desktop/src/__tests__/components/ImportPanel.test.ts`
  - Expected: FAIL because `ImportPanel` does not exist yet.

- [x] **Step 3: Implement `ImportPanel.vue` (minimal composition)**
  - Compose existing drag-drop behavior and URL batch input behavior.
  - Reuse queue store methods; do not alter queue pipeline logic.

- [x] **Step 4: Implement `AiQuickToggles.vue` and wire to Home**
  - Home must keep AI checkbox controls for frequent actions.
  - Keep control scope limited to toggles and save action (no heavy setup UI).

- [x] **Step 5: Update Home layout to final kept blocks**
  - Keep only:
    - ImportPanel
    - QueueTable
    - Output format quick toggles
    - AiQuickToggles
  - Remove model download/setup-heavy sections from Home.

- [x] **Step 6: Run component tests and typecheck**
  - Run: `pnpm --filter @fosswhisper/desktop test:run apps/desktop/src/__tests__/components/DropZone.test.ts apps/desktop/src/__tests__/components/ImportPanel.test.ts`
  - Run: `pnpm --filter @fosswhisper/desktop typecheck`
  - Expected: PASS for import/toggle/home composition tests.

- [ ] **Step 7: Commit Home workflow refactor**
```bash
git add apps/desktop/src/views/HomeView.vue apps/desktop/src/components/ImportPanel.vue apps/desktop/src/components/AiQuickToggles.vue apps/desktop/src/components/UrlInput.vue apps/desktop/src/components/DropZone.vue apps/desktop/src/__tests__/components/ImportPanel.test.ts apps/desktop/src/__tests__/components/DropZone.test.ts
git commit -m "refactor(desktop): simplify home workspace layout"
```

---

## Task 5: Complete Settings sections with folder actions and moved setup controls

**Files:**
- Modify: `apps/desktop/src/views/SettingsView.vue`
- Modify: `apps/desktop/src/components/ModelSelector.vue`
- Modify: `apps/desktop/src/components/SettingsPanel.vue`
- Modify: `apps/desktop/src/stores/whisper.ts` (only if helper wrappers needed for folder-open actions)
- Test: `apps/desktop/src/__tests__/stores/whisper.test.ts` (if store wrappers added)
- Test: `apps/desktop/src/__tests__/components/*` for settings interactions

- [x] **Step 1: Write failing tests for folder action buttons in Settings**
  - Validate click triggers:
    - `window.fosswhisper.openModelFolder()`
    - `window.fosswhisper.openOutputFolder()`
  - Validate user feedback path for success/error states.

- [ ] **Step 2: Run tests to confirm failure**
  - Run: `pnpm --filter @fosswhisper/desktop test:run`
  - Expected: FAIL due to missing button wiring or APIs.

- [x] **Step 3: Implement Settings UI sections exactly per approved IA**
  - Model settings section: model list/download + model path + open model folder.
  - Transcription settings section: threads/language/metal/outputDir.
  - Download settings section: ytdlp format/cookies + open output folder.

- [x] **Step 4: Ensure output folder action semantics**
  - Keep renderer simple; main process owns fallback resolution.
  - Display concise success/error message to user.

- [x] **Step 5: Run tests/typecheck**
  - Run: `pnpm --filter @fosswhisper/desktop test:run`
  - Run: `pnpm --filter @fosswhisper/desktop typecheck`
  - Expected: PASS across settings UI + IPC integration assumptions.

- [ ] **Step 6: Commit settings completion**
```bash
git add apps/desktop/src/views/SettingsView.vue apps/desktop/src/components/ModelSelector.vue apps/desktop/src/components/SettingsPanel.vue apps/desktop/src/stores/whisper.ts apps/desktop/src/__tests__/stores/whisper.test.ts
git commit -m "feat(desktop): move setup controls into settings page"
```

---

## Task 6: Final verification and regression guard

**Files:**
- Modify (if needed): affected tests only

- [x] **Step 1: Run focused desktop test suite**
  - Run: `pnpm --filter @fosswhisper/desktop test:run`
  - Expected: PASS.

- [ ] **Step 2: Run workspace typecheck**
  - Run: `pnpm typecheck`
  - Expected: PASS for all packages.

- [ ] **Step 3: Manual verification checklist**
  - Home has only required blocks (import, queue, output formats, AI toggles).
  - Gear navigation to `/settings` works.
  - Settings has 3 approved sections.
  - Open model folder works.
  - Open output folder uses `outputDir` or fallback default.
  - Drag/drop and URL imports still enqueue and process normally.

- [ ] **Step 4: Commit final fixes (if any)**
```bash
git add <only-files-changed-during-verification>
git commit -m "test(desktop): finalize workspace/settings UX regression coverage"
```

---

## Notes for execution

- Keep refactor scoped to UX placement and folder actions only (no pipeline rewrites).
- Prefer reusing existing stores and methods; avoid introducing parallel state paths.
- If a section starts expanding, split small presentational subcomponents rather than increasing `HomeView.vue` or `SettingsView.vue` complexity.

---

## Remaining Outstanding

- Decide whether to create the intermediate commits listed in Task 1, Task 2, Task 3, Task 4, and Task 5.
- Complete Task 6 final verification:
  - workspace typecheck
  - manual verification checklist for navigation, folder-open actions, and import workflow
- Apply any verification fixes and optionally create the final regression-coverage commit.

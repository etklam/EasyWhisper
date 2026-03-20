# Desktop UI/UX Simplification Design

Date: 2026-03-18
Scope: `apps/desktop` (Home + Settings UX re-organization)

## 1. Goals

- Keep Home focused on the daily workflow.
- Move infrequent setup/configuration into a dedicated Settings page.
- Group yt-dlp URL input and file drag/drop into one unified import area.
- Add quick folder actions in Settings:
  - Open model folder
  - Open output folder

## 2. Final UX Decisions (validated)

### Home keeps only:
1. Unified import area (file drag/drop + yt-dlp URL)
2. Task queue
3. Output format quick toggles
4. AI feature checkboxes (translate / summary / clean-correct etc.)

### Settings page contains:
1. **Model Settings**
   - Model list + download actions
   - Model path
   - Open model folder
2. **Transcription Settings**
   - threads / language / Metal / outputDir
3. **Download Settings**
   - yt-dlp audio format / cookies path
   - Open output folder

### Navigation:
- Add top-right gear action on Home to navigate to `/settings`.
- Add clear “Back to Workspace” action on Settings.

## 3. Information Architecture

- Route `/` = workspace (Home)
- Route `/settings` = setup/configuration
- Avoid mixed responsibility on Home; no model download UI on first screen.

## 4. Component-level Design

### 4.1 Home composition
- Keep `QueueTable`.
- Keep output format card.
- Keep `AiPanel` for AI toggles.
- Replace separate import blocks with one **ImportPanel** (new or refactored composition):
  - Local files (drag/drop + picker)
  - URL import (yt-dlp)

### 4.2 Settings composition
- Move model download/selection-focused UI from `ModelSelector` usage into Settings page.
- Keep/expand settings form sections:
  - Model settings card
  - Transcription settings card
  - Download settings card
- Keep field update behavior consistent with existing `whisperStore.updateSettings` flow.

## 5. IPC Design

Add two renderer-callable actions:

1. `openModelFolder()`
2. `openOutputFolder()`

### Renderer
- Settings buttons call preload APIs exposed on `window.fosswhisper`.

### Preload
- Add `ipcRenderer.invoke(...)` wrappers for both actions.

### Main process
- Add handlers under existing IPC organization:
  - Resolve directory path
  - Ensure directory exists (create if missing)
  - Open folder in Finder using Electron shell APIs
  - Return structured success/failure response

### Path resolution rules
- **Model folder**: use the same base resolution strategy as model download destination.
- **Output folder**:
  - Use `settings.outputDir` when provided
  - Fallback to default output directory when empty

## 6. Error Handling UX

- Success: concise positive toast.
- Failure: actionable error toast message from IPC response.
- Do not silently fail on folder open operations.

## 7. Testing Strategy

### Manual acceptance
1. Home only shows workflow-critical blocks (import, queue, output formats, AI toggles).
2. Settings holds setup sections and folder actions.
3. Gear navigation to `/settings` works; return action works.
4. File import and URL import both enqueue tasks as before.
5. Model folder and output folder open actions behave correctly.
6. Output folder action uses `outputDir` or default fallback.

### Automated tests (minimum required)
- Component tests:
  - Unified import panel interactions (drag/drop + URL submit).
  - Settings folder-action button triggers corresponding APIs.
- IPC tests:
  - `openModelFolder` handler success/failure paths.
  - `openOutputFolder` with explicit `outputDir` and fallback case.

## 8. Out of Scope

- Changing transcription pipeline logic.
- Changing queue processing semantics.
- New AI features or new download providers.
- Full visual redesign beyond layout/placement simplification.

## 9. Implementation Notes

- Keep refactor targeted to requested UX changes.
- Reuse existing stores and IPC conventions.
- Prefer moving/recomposing existing components over creating parallel feature logic.

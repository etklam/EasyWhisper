# EASYWhisper

EASYWhisper is a local-first desktop transcription app built with Electron, Vue 3, and `whisper.cpp`.
It supports file and URL batch workflows, optional AI post-processing through Ollama, and multiple output formats.

## Current Status

- Product name: `EASYWhisper`
- Version: `0.1.0-alpha`
- Primary target: macOS desktop
- Windows runtime and packaging support are present but still evolving

## Features

- Local transcription with `whisper.cpp`
- Batch queue for audio, video, and URL jobs
- Drag-and-drop file import
- `yt-dlp` download support
- Automatic audio conversion through `ffmpeg`
- Output formats: `txt`, `srt`, `vtt`, `json`
- Task-level output folder actions
- Output location options:
  - use the default output folder
  - save next to the source file
- Configurable default language and homepage language override
- AI post-processing with Ollama:
  - correct
  - translate
  - summarize
- Custom AI prompts with reset-to-default controls
- Model management for Whisper models
- Managed/system tool modes for `yt-dlp` and `ffmpeg`

## Repository Layout

```text
apps/desktop/      Electron + Vue desktop app
packages/shared/   Shared types, IPC contracts, helpers
packages/ui/       UI package placeholder
backend/           Optional FastAPI backend
docs/              Design and implementation notes
```

## Requirements

- Node.js 22+
- `pnpm` 10+
- macOS for the current primary packaging workflow

Optional but recommended:

- Ollama
- ffmpeg
- yt-dlp

## Development

Install dependencies:

```bash
pnpm install
```

Run the desktop app in development:

```bash
pnpm dev
```

Run all tests:

```bash
pnpm test:run
```

Build the desktop app:

```bash
pnpm --filter @easywhisper/desktop build
```

## Packaging

Build the macOS app bundle:

```bash
pnpm package:mac
```

Build the Windows package:

```bash
pnpm package:win
```

Note:
`package:mac` currently builds the `.app` successfully, but DMG creation can still fail on some machines because `hdiutil` may return `Device not configured`.

## AI Prompt Configuration

AI settings are available in the Settings page.
You can configure:

- model
- translation target language
- enabled AI steps
- custom prompts for correct / translate / summary

Each custom prompt can be reset back to the built-in default from the Settings page.

## Output Behavior

For file-based tasks, you can choose whether outputs should be written:

- to the app's default output folder
- beside the input file

For downloaded media, the app now preserves the original media title for downstream output filenames instead of relying on unstable temporary names.

## Documentation Kept in Root

- [CHANGELOG.md](./CHANGELOG.md)
- [dev-plan.md](./dev-plan.md)
- [tech-debt.md](./tech-debt.md)

## Acknowledgements

- [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
- [Ollama](https://ollama.com/)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [Electron](https://www.electronjs.org/)
- [Vue](https://vuejs.org/)
- [Naive UI](https://www.naiveui.com/)
